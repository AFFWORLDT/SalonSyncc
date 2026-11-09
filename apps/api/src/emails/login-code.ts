import { button, codeBox, emailLayout, esc, noticeBox, pillDivider } from "./layout";
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
    : `Tap below to sign in to <b>${esc(o.salonName)}</b>, or type the code in the app.`;
  const body = `<p style="margin:0;font-size:16px;line-height:24px;text-align:center">${intro}</p>
${button(o.link, o.invitedBy ? `Join ${o.salonName}` : `Sign in to ${o.salonName}`, true)}
${pillDivider("Or enter this code")}
${codeBox(o.code)}
<p style="margin:14px 0 0;font-size:14px;color:#67635b;text-align:center">&#9719;&nbsp; The link and code work once, for ${lasts}.</p>`;
  const why = o.invitedBy
    ? `You get this because ${o.salonName} added your email to its team. If that's a mistake, ignore this email.`
    : "If you didn't try to sign in, ignore this email: nobody can sign in without the code.";
  const text = o.invitedBy
    ? `${o.invitedBy} added you to ${o.salonName} on ${o.brand}.\n\nOpen this on your phone to join, already signed in:\n${o.link}\n\nOr enter the code ${o.code} in the app. It works once, for ${lasts}.`
    : `Your ${o.salonName} sign-in code is ${o.code}.\n\nOr tap to sign in:\n${o.link}\n\nIt works once, for ${lasts}.`;
  const hero = o.invitedBy
    ? { greeting: `Hi ${first},`, title: "Welcome to", accent: `${o.brand}!`, line: `${o.salonName} added you to its team. Your first day starts here.` }
    : { greeting: `Hi ${first},`, title: "Here's your", accent: "sign-in code", line: `For ${o.salonName}. It works once.` };
  return {
    to: o.to,
    subject,
    html: emailLayout({ brand: o.brand, siteUrl: o.siteUrl, preheader: o.invitedBy ? `Join ${o.salonName} on ${o.brand}` : `Your code: ${o.code}`, body: body + noticeBox(esc(why)), footer: "", hero }),
    text: `${text}\n\n${why}`,
  };
}
