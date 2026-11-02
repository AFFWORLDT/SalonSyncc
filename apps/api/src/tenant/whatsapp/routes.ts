import { Hono } from "hono";
import type { WaConfigView } from "@ss/contract";
import type { AppEnv } from "../../env";
import { HttpError } from "../../core/errors";
import { requireFeature } from "../../core/pipeline";
import { requireAdmin } from "../../core/roles";
import { platformRepo } from "../../data/platform";
import { settingsRepo, waConfigRepo, type WaConfigInput } from "../../data/tenant";
import { canonicalPhone } from "../../lib/phone";

/**
 * The salon's own WhatsApp credentials: GET/PUT/DELETE /whatsapp/config. Owner/admin, feature `whatsapp`, gated per
 * route (router mounted at "/"). The token is write-only (RF4): never in a response, an audit row or an error.
 * Later tasks add the template/campaign/bill routes here.
 */
export const whatsapp = new Hono<AppEnv>();

const bad = (m: string) => new HttpError(400, m);
const ID_RE = /^\d{5,25}$/;
const MAX_TEST_NUMBERS = 20;
const DUPLICATE = "That WhatsApp number is already connected to another salon";

/** Parses the PUT body. Error messages never include the submitted token. */
function parseConfig(b: unknown, callingCode: string): WaConfigInput {
  if (!b || typeof b !== "object" || Array.isArray(b)) throw bad("Send the WhatsApp settings as JSON");
  const o = b as Record<string, unknown>;
  const id = (k: string, label: string) => {
    const v = typeof o[k] === "string" ? (o[k] as string).trim() : "";
    if (!ID_RE.test(v)) throw bad(`${label} must be 5 to 25 digits`);
    return v;
  };
  const phoneNumberId = id("phone_number_id", "Phone number ID");
  const wabaId = id("waba_id", "WhatsApp Business Account ID");
  const token = o.token;
  if (typeof token !== "string" || !token) throw bad("Enter the access token");
  if (token.length > 512) throw bad("The access token is too long");
  if (/\s/.test(token)) throw bad("The access token can't contain spaces");
  const raw = o.test_numbers;
  let testNumbers: string | null = null;
  if (raw !== undefined && raw !== null) {
    if (typeof raw !== "string") throw bad("Test numbers must be a comma-separated list");
    const list = raw.split(",").map((s) => s.trim()).filter(Boolean);
    if (list.length > MAX_TEST_NUMBERS) throw bad(`At most ${MAX_TEST_NUMBERS} test numbers`);
    const out: string[] = [];
    for (const n of list) {
      const p = canonicalPhone(n, callingCode);
      if (!p) throw bad(`"${n.slice(0, 30)}" isn't a valid phone number`);
      if (!out.includes(p)) out.push(p);
    }
    testNumbers = out.length ? out.join(",") : null;
  }
  return { phoneNumberId, wabaId, token, testNumbers };
}

const gate = [requireFeature("whatsapp"), requireAdmin] as const;

whatsapp.get("/whatsapp/config", ...gate, async (c) => {
  const m = await waConfigRepo(c.env.DB, c.var.tenant.org.id, c.env.SECRETS_KEY).meta();
  const view: WaConfigView | null = m
    ? { phone_number_id: m.phoneNumberId, waba_id: m.wabaId, test_numbers: m.testNumbers ? m.testNumbers.split(",") : [], has_token: true }
    : null;
  return c.json(view);
});

whatsapp.put("/whatsapp/config", ...gate, async (c) => {
  let body: unknown;
  try {
    body = await c.req.json();
  } catch {
    throw bad("Send the WhatsApp settings as JSON");
  }
  const { org, user } = c.var.tenant;
  const { phone_country } = await settingsRepo(c.env.DB, org.id).get();
  const input = parseConfig(body, phone_country);
  const owner = await platformRepo(c.env.DB).orgByPhoneNumberId(input.phoneNumberId);
  if (owner && owner.id !== org.id) throw new HttpError(409, DUPLICATE);
  const r = await waConfigRepo(c.env.DB, org.id, c.env.SECRETS_KEY).set(input, { id: user.id, name: user.name });
  if (r === "conflict") throw new HttpError(409, DUPLICATE);
  return c.json({ wa_ready: true });
});

whatsapp.delete("/whatsapp/config", ...gate, async (c) => {
  const { org, user } = c.var.tenant;
  await waConfigRepo(c.env.DB, org.id, c.env.SECRETS_KEY).clear({ id: user.id, name: user.name });
  return c.json({ wa_ready: false });
});
