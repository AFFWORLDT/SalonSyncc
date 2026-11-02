import type { WaSlot } from "@ss/contract";
import { HttpError } from "../core/errors";
import type { SendResult, WaClient, WaConfig, WaTemplateCreate, WaTemplateInfo } from "../core/services";
import { allowedRecipient, templateComponents, templateSlots, waRecipient } from "../lib/whatsapp";

/**
 * The real WhatsApp client: Meta Graph (Cloud API) for one org's number (FM whatsapp.ts graph/sendTemplate/uploadMedia/
 * listTemplates/createTemplate). Each call takes the org's decrypted WaConfig.
 *
 * Token safety (RF4): the token only ever goes into the Authorization header. Error text from Meta or from fetch
 * is passed through `safe()`, which replaces every occurrence of the token, and request headers are never included
 * in any error. sendTemplate never throws; the others throw HttpError(502, "WhatsApp error: <safe message>").
 */
export const GRAPH = "https://graph.facebook.com/v21.0";

type GraphError = { error?: { message?: string; error_user_msg?: string; code?: number } };

/** Error text without the token, trimmed to 300 chars. */
export function safeError(msg: unknown, token: string): string {
  let s = String(msg ?? "");
  if (token) s = s.split(token).join("[redacted]");
  return s.slice(0, 300);
}

/** A Graph failure: already token-free. */
class GraphFailure extends Error {}

const MEDIA: Record<string, WaSlot["media"]> = { IMAGE: "image", VIDEO: "video", DOCUMENT: "document" };

export function graphWaClient(fetchFn: typeof fetch = (...a) => fetch(...a)): WaClient {
  async function call<T>(cfg: WaConfig, path: string, init: { method?: string; body?: unknown; form?: FormData } = {}): Promise<T> {
    let res: Response;
    try {
      res = await fetchFn(`${GRAPH}/${path}`, {
        method: init.method ?? "GET",
        headers: { Authorization: `Bearer ${cfg.token}`, ...(init.body !== undefined ? { "Content-Type": "application/json" } : {}) },
        body: init.form ?? (init.body !== undefined ? JSON.stringify(init.body) : undefined),
      });
    } catch (e) {
      throw new GraphFailure(safeError((e as Error)?.message ?? e, cfg.token) || "WhatsApp is unreachable");
    }
    const data = (await res.json().catch(() => ({}))) as T & GraphError;
    if (!res.ok || data?.error) {
      throw new GraphFailure(safeError(data?.error?.error_user_msg || data?.error?.message || `WhatsApp error ${res.status}`, cfg.token));
    }
    return data;
  }

  /** For the admin calls: a typed result or HttpError 502 with a token-free message. */
  async function admin<T>(cfg: WaConfig, run: () => Promise<T>): Promise<T> {
    try {
      return await run();
    } catch (e) {
      const msg = e instanceof GraphFailure ? e.message : safeError((e as Error)?.message ?? e, cfg.token);
      throw new HttpError(502, `WhatsApp error: ${msg || "request failed"}`);
    }
  }

  return {
    async sendTemplate(cfg, phone, template, lang, params): Promise<SendResult> {
      try {
        if (!allowedRecipient(cfg.testNumbers, phone, cfg.callingCode)) {
          return { status: "skipped", error: "Not a test number (only test numbers are messaged)" };
        }
        const data = await call<{ messages?: { id: string }[] }>(cfg, `${cfg.phoneNumberId}/messages`, {
          method: "POST",
          body: {
            messaging_product: "whatsapp",
            to: waRecipient(phone, cfg.callingCode),
            type: "template",
            template: { name: template, language: { code: lang }, ...(params.length ? { components: templateComponents(params) } : {}) },
          },
        });
        const id = data.messages?.[0]?.id;
        return id ? { status: "sent", wa_id: id } : { status: "failed", error: "WhatsApp did not accept the message" };
      } catch (e) {
        return { status: "failed", error: e instanceof GraphFailure ? e.message : safeError((e as Error)?.message ?? e, cfg.token) || "WhatsApp error" };
      }
    },

    async checkNumber(cfg): Promise<boolean> {
      try {
        const data = await call<{ id?: string }>(cfg, `${encodeURIComponent(cfg.phoneNumberId)}?fields=id`);
        return data.id === cfg.phoneNumberId;
      } catch {
        return false; // a Graph or network failure: not proven (the message may carry the token, so it is not passed on)
      }
    },

    uploadMedia: (cfg, file) =>
      admin(cfg, async () => {
        const form = new FormData();
        form.append("messaging_product", "whatsapp");
        form.append("type", file.type);
        form.append("file", file, file.name);
        const data = await call<{ id?: string }>(cfg, `${cfg.phoneNumberId}/media`, { method: "POST", form });
        if (!data.id) throw new GraphFailure("upload failed");
        return data.id;
      }),

    listTemplates: (cfg) =>
      admin(cfg, async (): Promise<WaTemplateInfo[]> => {
        type Component = { type: string; format?: string; text?: string; buttons?: { type: string; url?: string }[] };
        const data = await call<{ data?: { id: string; name: string; status: string; category: string; language: string; components?: Component[] }[] }>(
          cfg,
          `${cfg.wabaId}/message_templates?fields=id,name,status,category,language,components&limit=100`,
        );
        return (data.data ?? []).map((t) => {
          const head = t.components?.find((c) => c.type === "HEADER");
          const header = head?.format === "TEXT" ? (head.text ?? null) : null;
          const media = MEDIA[head?.format ?? ""];
          const body = t.components?.find((c) => c.type === "BODY")?.text ?? "";
          const slots = templateSlots(header, body, media);
          // A button link with a blank (or a location header) needs values we don't collect.
          const buttonBlank = !!t.components?.some((c) => c.type === "BUTTONS" && c.buttons?.some((b) => b.url?.includes("{{")));
          const sendable = (!head || head.format === "TEXT" || !!media) && !buttonBlank;
          return { id: t.id, name: t.name, status: t.status, category: t.category, language: t.language, header, body, vars: slots.length, slots, sendable };
        });
      }),

    createTemplate: (cfg, t: WaTemplateCreate) =>
      admin(cfg, async () => {
        const data = await call<{ id: string; status: string; name?: string }>(cfg, `${cfg.wabaId}/message_templates`, {
          method: "POST",
          body: {
            name: t.name,
            category: t.category,
            language: t.language,
            components: [{ type: "BODY", text: t.body, ...(t.examples.length ? { example: { body_text: [t.examples] } } : {}) }],
          },
        });
        return { id: data.id, status: data.status, ...(data.name ? { name: data.name } : {}) };
      }),
  };
}
