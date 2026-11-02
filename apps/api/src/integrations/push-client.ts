import type { Env } from "../env";
import type { Push, PushClient } from "../core/services";

/**
 * Firebase Cloud Messaging (HTTP v1), ported from FM push.ts. One FCM project serves every salon (secret
 * FCM_SERVICE_ACCOUNT, the service-account JSON key). The Worker signs a JWT (RS256, Web Crypto) with that key,
 * trades it for an OAuth token (cached per isolate until 5 minutes before expiry) and sends one message per token.
 * Without a valid secret every send is a no-op. Tests never reach this file's network calls: they use FakePush
 * through the services seam (test/fakes.ts); only buildAssertion is unit-tested.
 */

export interface ServiceAccount {
  project_id: string;
  client_email: string;
  private_key: string;
}

let cached: { token: string; exp: number; email: string } | null = null;
/** The parsed secret, memoised per isolate alongside the OAuth token (re-parsed only if the secret text changes). */
let parsed: { raw: string; sa: ServiceAccount | null } | null = null;

function account(env: Env): ServiceAccount | null {
  const raw = env.FCM_SERVICE_ACCOUNT;
  if (!raw) return null;
  if (parsed?.raw === raw) return parsed.sa;
  let sa: ServiceAccount | null = null;
  try {
    const a = JSON.parse(raw) as ServiceAccount;
    sa = a.project_id && a.client_email && a.private_key ? a : null;
  } catch {
    console.error("FCM_SERVICE_ACCOUNT is not valid JSON");
  }
  parsed = { raw, sa };
  return sa;
}

const b64url = (data: ArrayBuffer | Uint8Array | string): string => {
  const bytes = typeof data === "string" ? new TextEncoder().encode(data) : new Uint8Array(data);
  let s = "";
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
};

/** The signed JWT assertion for Google's OAuth token endpoint (valid one hour from `nowSec`). */
export async function buildAssertion(sa: ServiceAccount, nowSec: number): Promise<string> {
  const header = b64url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const claims = b64url(
    JSON.stringify({
      iss: sa.client_email,
      scope: "https://www.googleapis.com/auth/firebase.messaging",
      aud: "https://oauth2.googleapis.com/token",
      iat: nowSec,
      exp: nowSec + 3600,
    }),
  );
  const pem = sa.private_key.replace(/-----[^-]+-----/g, "").replace(/\s+/g, "");
  const der = Uint8Array.from(atob(pem), (ch) => ch.charCodeAt(0));
  const key = await crypto.subtle.importKey("pkcs8", der, { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" }, false, ["sign"]);
  const sig = await crypto.subtle.sign("RSASSA-PKCS1-v1_5", key, new TextEncoder().encode(`${header}.${claims}`));
  return `${header}.${claims}.${b64url(sig)}`;
}

async function accessToken(sa: ServiceAccount): Promise<string> {
  const nowSec = Math.floor(Date.now() / 1000);
  if (cached && cached.email === sa.client_email && cached.exp - 300 > nowSec) return cached.token;
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer", assertion: await buildAssertion(sa, nowSec) }),
  });
  if (!res.ok) throw new Error(`FCM auth failed: ${res.status} ${await res.text()}`);
  const j = (await res.json()) as { access_token: string; expires_in: number };
  cached = { token: j.access_token, exp: nowSec + j.expires_in, email: sa.client_email };
  return j.access_token;
}

/** FM's dead-token test: the app was uninstalled or the permission revoked. */
const isDead = (status: number, text: string) =>
  status === 404 || text.includes("UNREGISTERED") || (status === 400 && text.includes("registration token"));

export const fcmPush: PushClient = {
  async send(env: Env, tokens: string[], push: Push): Promise<{ dead: string[] }> {
    const sa = account(env);
    if (!sa || !tokens.length) return { dead: [] };
    const auth = await accessToken(sa);
    const link = push.link ?? new URL(push.path ?? "/", env.APP_ORIGIN).toString();
    const dead: string[] = [];
    // Per-token try/catch: one failed fetch (network error, subrequest cap) never loses the other tokens' dead reports.
    await Promise.all(
      tokens.map(async (token) => {
        try {
          const res = await fetch(`https://fcm.googleapis.com/v1/projects/${sa.project_id}/messages:send`, {
            method: "POST",
            headers: { authorization: `Bearer ${auth}`, "content-type": "application/json" },
            body: JSON.stringify({
              message: {
                token,
                webpush: {
                  notification: { title: push.title, body: push.body, icon: "/icon-192.png", badge: "/icon-192.png", tag: push.tag },
                  fcm_options: { link },
                },
              },
            }),
          });
          if (res.ok) return;
          const text = await res.text();
          if (isDead(res.status, text)) dead.push(token);
          else console.error("FCM send failed", res.status, text);
        } catch (err) {
          console.error("FCM send failed", err);
        }
      }),
    );
    return { dead };
  },
};
