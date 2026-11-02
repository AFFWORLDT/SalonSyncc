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
  opts: {
    send?: (s: WaSend) => SendResult | Promise<SendResult>;
    dead?: string[];
    templates?: WaTemplateInfo[];
    /** checkNumber's answer (default: every token can use its number). */
    numberOk?: (cfg: WaConfig) => boolean;
    /** Turnstile's answer (default: every token passes). */
    turnstileOk?: (token: string) => boolean;
    /** Whether the fake mail provider accepts mail (default true). */
    mailOk?: boolean;
    /** Stripe's answer per call (default: { id, url }). */
    stripe?: (path: string, params: Record<string, string>) => unknown;
  } = {},
) {
  const wa: WaSend[] = [];
  const uploads: { cfg: WaConfig; file: File }[] = [];
  const created: { cfg: WaConfig; name: string; language: string; body: string; examples: string[] }[] = [];
  const pushes: PushSend[] = [];
  const numberChecks: WaConfig[] = [];
  const mails: { to: string; subject: string; html: string; text: string }[] = [];
  const stripeCalls: { path: string; params: Record<string, string> }[] = [];
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
      async checkNumber(cfg) {
        numberChecks.push(cfg);
        return opts.numberOk ? opts.numberOk(cfg) : true;
      },
      async listTemplates() {
        return opts.templates ?? [];
      },
      async createTemplate(cfg, input) {
        created.push({ cfg, name: input.name, language: input.language, body: input.body, examples: input.examples });
        return { id: `tpl_fake${++n}`, status: "PENDING", name: input.name };
      },
    },
    mail: {
      async send(_env: Env, m) {
        mails.push(m);
        return opts.mailOk ?? true;
      },
    },
    stripe: {
      async post(_env: Env, path: string, params: Record<string, string>) {
        stripeCalls.push({ path, params });
        if (opts.stripe) return (await opts.stripe(path, params)) as never;
        return { id: `stripe_fake${++n}`, url: `https://stripe.test${path}/${n}` } as never;
      },
    },
    turnstile: {
      async verify(_secret: string, token: string) {
        return opts.turnstileOk ? opts.turnstileOk(token) : true;
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
    numberChecks,
    mails,
    stripeCalls,
    services: svc,
    install() {
      setServicesForTest(() => svc);
    },
    uninstall() {
      setServicesForTest(null);
    },
  };
}
