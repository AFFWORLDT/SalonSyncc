import { Hono, type Context } from "hono";
import type { WaParam, WaSlot } from "@ss/contract";
import type { AppEnv } from "../../env";
import { HttpError } from "../../core/errors";
import { requireFeature, TENANT_AUTH_STMTS } from "../../core/pipeline";
import { FREE_STMTS, FREE_SUBREQUESTS, meteredEnv } from "../../lib/metered";
import { requireAdmin } from "../../core/roles";
import { randomToken } from "../../core/crypto";
import { services, type SendResult, type WaConfig } from "../../core/services";
import { settingsRepo, waCampaignsRepo, waMessagesRepo } from "../../data/tenant";
import { canonicalPhone } from "../../lib/phone";
import { allowedRecipient, bodyParams, templateSlots, templateVars } from "../../lib/whatsapp";
import { CAMPAIGN_BATCH, DRAIN_FIXED_STMTS, drainCampaign } from "../../jobs/wa-jobs";
import { NOT_READY } from "../whatsapp/bill";
import { waSetup } from "../whatsapp/ready";

/**
 * WhatsApp templates, media, audience, test send and campaigns (FM routes.ts 1434-1554), per org. Every route: owner/
 * admin, feature `whatsapp_campaigns` (gated per route; router mounted at "/"), and the org must be WA-ready (feature
 * `whatsapp` + its own number), else 409 wa_not_ready. Id routes look the row up in this org first (another org's id
 * is 404, not 409).
 *
 * Free-plan limits (D19; raise on upgrade). D1's free daily write budget (~100k rows) is shared by every salon and a
 * campaign message costs about 11 row writes over its life (queue + indexes, claim, SENDING mark, result, receipts):
 *  - CAMPAIGN_MAX_AUDIENCE: a campaign goes to at most 1000 customers (a bigger audience is refused with 400);
 *  - one unfinished campaign per org at a time (409 campaign_running);
 *  - each /next sends at most CAMPAIGN_BATCH (15): the free plan counts every D1 statement (batched ones too) toward
 *    ~50 per request, and a cold /next costs about 11 + 2 per send (~41).
 */
export const campaigns = new Hono<AppEnv>();

/** Free-plan limit (raise on upgrade): the most recipients one campaign queues. */
export const CAMPAIGN_MAX_AUDIENCE = 1000;
/** WhatsApp's media limits (MB): images up to 5 MB, videos (mp4, H.264 + AAC) up to 16 MB. */
const MEDIA_TYPES: Record<string, number> = { "image/jpeg": 5, "image/png": 5, "video/mp4": 16 };
const MB = 1024 * 1024;

const bad = (m: string) => new HttpError(400, m);
const gate = [requireFeature("whatsapp_campaigns"), requireAdmin] as const;

function clean(v: unknown, max = 200): string | null {
  if (v === undefined || v === null) return null;
  const s = String(v).trim().slice(0, max);
  return s ? s : null;
}

async function body<T>(c: Context<AppEnv>): Promise<Partial<T>> {
  const b = await c.req.json().catch(() => null);
  return b && typeof b === "object" && !Array.isArray(b) ? (b as Partial<T>) : {};
}

/** The org's WhatsApp config, or 409 wa_not_ready. */
async function ready(c: Context<AppEnv>): Promise<WaConfig> {
  const cfg = await waSetup(c, c.var.tenant.org);
  if (!cfg) throw new HttpError(409, NOT_READY, "wa_not_ready");
  return cfg;
}

/** FM readParams: one value per slot, each tagged with its slot; media slots need an uploaded id (or a link). */
function readParams(raw: unknown, slots: WaSlot[]): WaParam[] {
  const list = Array.isArray(raw) ? raw : [];
  if (list.length !== slots.length) throw bad(`This template needs ${slots.length} value${slots.length === 1 ? "" : "s"}`);
  return list.map((p, i) => {
    const slot = slots[i]!;
    if (slot.media) {
      const text = clean((p as { text?: unknown })?.text, 300);
      if (!text) throw bad(`Upload the ${slot.media} for this template first`);
      return { text, ...slot };
    }
    if (p && typeof p === "object" && (p as { customer_name?: unknown }).customer_name) return { customer_name: true as const, ...slot };
    const text = clean((p as { text?: unknown })?.text, 300);
    if (!text) throw bad(`Fill in ${slot.part === "header" ? "the header's " : ""}{{${slot.key}}}`);
    return { text, ...slot };
  });
}

/** FM approvedTemplate: an approved, sendable template of this org's WhatsApp account. */
async function approvedTemplate(c: Context<AppEnv>, cfg: WaConfig, name: string) {
  const t = (await services(c.env).wa.listTemplates(cfg)).find((x) => x.name === name);
  if (!t) throw new HttpError(404, "Template not found");
  if (t.status !== "APPROVED") throw bad(`"${name}" is ${t.status.toLowerCase()} — only approved templates can be sent`);
  if (!t.sendable) throw bad(`"${name}" has a header or a link button with a blank, which this app can't fill yet`);
  return t;
}

const running409 = () => new HttpError(409, "Finish the current campaign first", "campaign_running");
const actor = (c: Context<AppEnv>) => ({ id: c.var.tenant.user.id, name: c.var.tenant.user.name });

campaigns.get("/wa/templates", ...gate, async (c) => {
  const cfg = await ready(c);
  return c.json(await services(c.env).wa.listTemplates(cfg));
});

campaigns.post("/wa/templates", ...gate, async (c) => {
  const cfg = await ready(c);
  const b = await body<{ name: string; category: string; body: string; examples: unknown[] }>(c);
  const name = String(b.name ?? "").trim().toLowerCase().replace(/[\s-]+/g, "_");
  if (!/^[a-z0-9_]{3,60}$/.test(name)) throw bad("Name: 3–60 lower-case letters, digits or _ (e.g. eid_offer)");
  const category = b.category === "UTILITY" ? "UTILITY" : "MARKETING";
  const text = clean(b.body, Infinity);
  if (!text) throw bad("Write the message");
  if (text.length > 1024) throw bad("Message too long (max 1024)");
  const vars = templateVars(text);
  const examples = (Array.isArray(b.examples) ? b.examples : []).map((e) => clean(e, 100) ?? "");
  if (examples.length !== vars || examples.some((e) => !e)) throw bad(`Give an example for each of the ${vars} blank${vars === 1 ? "" : "s"}`);
  if (/^\s*\{\{|\}\}\s*$/.test(text)) throw bad("WhatsApp doesn't allow a blank ({{n}}) at the very start or end of the message");
  const { wa_language: language } = await settingsRepo(c.env.DB, c.var.tenant.org.id).get();
  const created = await services(c.env).wa.createTemplate(cfg, { name, category, language, body: text, examples });
  await waCampaignsRepo(c.env.DB, c.var.tenant.org.id).templateCreated(actor(c), { name, category, body: text });
  return c.json(
    { id: created.id, name, status: created.status, category, language, header: null, body: text, vars, slots: templateSlots(null, text), sendable: true },
    201,
  );
});

/** One message to an admin-supplied phone (canonical with the org's calling code), logged as kind "test". */
campaigns.post("/wa/test", ...gate, async (c) => {
  const cfg = await ready(c);
  const b = await body<{ to: string; template: string; params: unknown }>(c);
  const phone = canonicalPhone(String(b.to ?? ""), cfg.callingCode);
  if (!phone) throw bad("Enter a valid mobile number for the test");
  const t = await approvedTemplate(c, cfg, String(b.template ?? ""));
  const params = bodyParams(readParams(b.params, t.slots), null);
  const r: SendResult = allowedRecipient(cfg.testNumbers, phone, cfg.callingCode)
    ? await services(c.env).wa.sendTemplate(cfg, phone, t.name, t.language, params)
    : { status: "skipped", error: "not in test numbers" };
  return c.json(await waMessagesRepo(c.env.DB, c.var.tenant.org.id).log({ kind: "test", phone, template: t.name, params, actorId: c.var.tenant.user.id }, r));
});

campaigns.get("/wa/audience", ...gate, async (c) => {
  await ready(c);
  return c.json({ customers: await waCampaignsRepo(c.env.DB, c.var.tenant.org.id).audienceSize() });
});

campaigns.get("/wa/campaigns", ...gate, async (c) => {
  await ready(c);
  return c.json(await waCampaignsRepo(c.env.DB, c.var.tenant.org.id).list());
});

/** Queues the template for every audience customer (at most CAMPAIGN_MAX_AUDIENCE, one unfinished campaign per org); sending is /next (or the cron). */
campaigns.post("/wa/campaigns", ...gate, async (c) => {
  const cfg = await ready(c);
  const b = await body<{ template: string; params: unknown }>(c);
  const t = await approvedTemplate(c, cfg, String(b.template ?? ""));
  const params = readParams(b.params, t.slots);
  const repo = waCampaignsRepo(c.env.DB, c.var.tenant.org.id);
  const { audience, running } = await repo.createCheck();
  if (running) throw running409();
  if (!audience) throw bad("No customers to send to");
  if (audience > CAMPAIGN_MAX_AUDIENCE) throw bad(`Campaigns are limited to ${CAMPAIGN_MAX_AUDIENCE} customers on the current plan`);
  const k = await repo.create({ uid: randomToken(12), template: t.name, language: t.language, params, actor: actor(c), cap: CAMPAIGN_MAX_AUDIENCE });
  if (!k) throw running409(); // another create won the race: nothing was written
  return c.json(k, 201);
});

/** Sends the next batch of up to CAMPAIGN_BATCH (15). */
campaigns.post("/wa/campaigns/:id/next", ...gate, async (c) => {
  const id = Number(c.req.param("id"));
  if (!Number.isInteger(id) || id <= 0) throw new HttpError(404, "Not found");
  const orgId = c.var.tenant.org.id;
  // The cron's two counters (lib/metered): after auth's reserved worst case, row 1 + WA config 1 + drain 5 + 2 per send.
  const budget = { left: FREE_SUBREQUESTS, stmts: FREE_STMTS - TENANT_AUTH_STMTS };
  const env = meteredEnv(c.env, budget);
  const row = await waCampaignsRepo(env.DB, orgId).row(id);
  if (!row) throw new HttpError(404, "Not found");
  const cfg = await waSetup(env, c.var.tenant.org, c.var.tenant.features);
  if (!cfg) throw new HttpError(409, NOT_READY, "wa_not_ready");
  const limit = Math.min(CAMPAIGN_BATCH, budget.left, Math.floor((budget.stmts - DRAIN_FIXED_STMTS) / 2));
  const k = await drainCampaign(env, orgId, id, limit, budget, { cfg, row });
  if (!k) throw new HttpError(404, "Not found");
  return c.json(k);
});

/** A header picture or video uploaded to Meta (multipart field "file"); returns Meta's media id. */
campaigns.post("/wa/media", ...gate, async (c) => {
  const cfg = await ready(c);
  // Refuse an oversized body before parsing it (the multipart overhead allowance is generous).
  if (Number(c.req.header("content-length") ?? 0) > 16 * MB + 64 * 1024) throw bad("That file is too big — WhatsApp allows up to 16 MB");
  const form = await c.req.formData().catch(() => null);
  const file = form?.get("file");
  if (!file || typeof file === "string") throw bad("Choose a picture or video");
  const maxMb = MEDIA_TYPES[file.type];
  if (!maxMb) throw bad("Use a JPG or PNG picture, or an MP4 video");
  if (file.size > maxMb * MB) throw bad(`That file is too big — WhatsApp allows up to ${maxMb} MB`);
  // The parsed File goes to Graph as-is (no second copy of the bytes).
  return c.json({ id: await services(c.env).wa.uploadMedia(cfg, file) });
});
