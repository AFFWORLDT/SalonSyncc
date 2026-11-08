import { button, emailLayout, esc } from "./layout";
import type { Email } from "./staff";

/**
 * The 6-digit sign-in code and a one-tap link (opens the app, or the web sign-in). Short on purpose: the code is in the
 * subject, readable in the notification preview. [invitedBy]: a staff invite ("Sam added you to …").
 */
export function loginCodeEmail(o: {
  brand: string;
  siteUrl: string;
  salonName: string;
  to: string;
  name: string;
  code: string;
  link: string;
  minutes: number;
  invitedBy?: string;
}): Email {
  const first = o.name.trim().split(/\s+/)[0] || o.name;
  const lasts = o.minutes >= 1440 ? `${Math.round(o.minutes / 1440)} days` : `${o.minutes} minutes`;
  const subject = o.invitedBy ? `${o.invitedBy} added you to ${o.salonName}` : `${o.code} is your ${o.salonName} sign-in code`;
  const intro = o.invitedBy
    ? `${esc(o.invitedBy)} added you to <b>${esc(o.salonName)}</b> on ${esc(o.brand)}. Tap below on your phone to open the app, already signed in.`
    : `Tap below to sign in to ${esc(o.salonName)}, or type this code in the app:`;
  const body = `<p style="margin:0 0 12px;font-size:16px">Hi ${esc(first)},</p>
<p style="margin:0 0 4px;font-size:15px;line-height:22px">${intro}</p>
${button(o.link, o.invitedBy ? `Join ${o.salonName}` : "Sign in")}
<p style="margin:0 0 8px;font-size:14px;color:#67635b">Or enter this code:</p>
<p style="margin:0 0 20px;font-size:34px;font-weight:700;letter-spacing:8px;font-family:ui-monospace,Menlo,monospace">${esc(o.code)}</p>
<p style="margin:0;font-size:14px;line-height:20px;color:#67635b">The link and code work once, for ${lasts}.</p>`;
  const why = o.invitedBy
    ? `You get this because ${o.salonName} added your email to its team. If that's a mistake, ignore this email.`
    : "If you didn't try to sign in, ignore this email: nobody can sign in without the code.";
  const text = o.invitedBy
    ? `${o.invitedBy} added you to ${o.salonName} on ${o.brand}.\n\nOpen this on your phone to join, already signed in:\n${o.link}\n\nOr enter the code ${o.code} in the app. It works once, for ${lasts}.`
    : `Your ${o.salonName} sign-in code is ${o.code}.\n\nOr tap to sign in:\n${o.link}\n\nIt works once, for ${lasts}.`;
  return {
    to: o.to,
    subject,
    html: emailLayout({ brand: o.brand, siteUrl: o.siteUrl, preheader: o.invitedBy ? `Join ${o.salonName} on ${o.brand}` : `Your code: ${o.code}`, body, footer: esc(why) }),
    text: `${text}\n\n${why}`,
  };
}
