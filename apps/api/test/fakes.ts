import type { Env } from "../src/env";
import { setServicesForTest, type Push, type SendResult, type Services, type WaConfig, type WaTemplateInfo, type WaValue } from "../src/core/services";

export interface WaSend {
  cfg: WaConfig;
  phone: string;
  template: string;
  lang: string;
  params: WaValue[];
}
export interface PushSend {
  tokens: string[];
  push: Push;
}

/**
 * In-memory WhatsApp + push clients that record every call. `install()` swaps them in through the services seam;
 * call `uninstall()` (or `setServicesForTest(null)`) in afterEach.
 */
export function fakeServices(
  opts: { send?: (s: WaSend) => SendResult | Promise<SendResult>; dead?: string[]; templates?: WaTemplateInfo[] } = {},
) {
  const wa: WaSend[] = [];
  const uploads: { cfg: WaConfig; file: File }[] = [];
  const created: { cfg: WaConfig; name: string; language: string; body: string; examples: string[] }[] = [];
  const pushes: PushSend[] = [];
  let n = 0;
  const svc: Services = {
    wa: {
      async sendTemplate(cfg, phone, template, lang, params) {
        const s = { cfg, phone, template, lang, params };
        wa.push(s);
        return opts.send ? await opts.send(s) : { status: "sent", wa_id: `wamid.fake${++n}` };
      },
      async uploadMedia(cfg, file) {
        uploads.push({ cfg, file });
        return `media_fake${++n}`;
      },
      async listTemplates() {
        return opts.templates ?? [];
      },
      async createTemplate(cfg, input) {
        created.push({ cfg, name: input.name, language: input.language, body: input.body, examples: input.examples });
        return { id: `tpl_fake${++n}`, status: "PENDING", name: input.name };
      },
    },
    push: {
      async send(_env: Env, tokens: string[], push: Push) {
        pushes.push({ tokens, push });
        return { dead: (opts.dead ?? []).filter((t) => tokens.includes(t)) };
      },
    },
  };
  return {
    wa,
    uploads,
    created,
    pushes,
    services: svc,
    install() {
      setServicesForTest(() => svc);
    },
    uninstall() {
      setServicesForTest(null);
    },
  };
}
