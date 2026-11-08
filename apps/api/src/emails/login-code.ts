import { emailLayout, esc } from "./layout";
import type { Email } from "./staff";

/** The 6-digit sign-in code. Short on purpose: the code is the whole message, readable in the notification preview. */
export function loginCodeEmail(o: { brand: string; siteUrl: string; salonName: string; to: string; name: string; code: string; minutes: number }): Email {
  const subject = `${o.code} is your ${o.salonName} sign-in code`;
  const body = `<p style="margin:0 0 12px;font-size:16px">Hi ${esc(o.name.trim().split(/\s+/)[0] || o.name)},</p>
<p style="margin:0 0 20px;font-size:15px;line-height:22px">Use this code to sign in to ${esc(o.salonName)}:</p>
<p style="margin:0 0 20px;font-size:34px;font-weight:700;letter-spacing:8px;font-family:ui-monospace,Menlo,monospace">${esc(o.code)}</p>
<p style="margin:0;font-size:14px;line-height:20px;color:#67635b">It works once, for ${o.minutes} minutes.</p>`;
  const why = "If you didn't try to sign in, ignore this email: nobody can sign in without the code.";
  return {
    to: o.to,
    subject,
    html: emailLayout({ brand: o.brand, siteUrl: o.siteUrl, preheader: `Your code: ${o.code}`, body, footer: esc(why) }),
    text: `Your ${o.salonName} sign-in code is ${o.code}. It works once, for ${o.minutes} minutes.\n\n${why}`,
  };
}
