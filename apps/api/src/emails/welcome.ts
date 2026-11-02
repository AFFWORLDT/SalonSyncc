import { button, emailLayout, esc } from "./layout";

export interface WelcomeEmail {
  brand: string;
  siteUrl: string; // https://salonkit.online
  salonName: string;
  ownerName: string;
  slug: string;
  salonUrl: string; // https://<slug>.salonkit.online/
  username: string; // the owner signs in with this (their email)
  trialEndsAt: number;
  supportEmail: string;
}

const dateLabel = (ms: number) => new Date(ms).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" });

/** Sent right after signup: the salon's address, how to sign in, the trial end date and the first steps. */
export function welcomeEmail(w: WelcomeEmail): { subject: string; html: string; text: string } {
  const first = w.ownerName.trim().split(/\s+/)[0] ?? w.ownerName;
  const ends = dateLabel(w.trialEndsAt);
  const subject = `Welcome to ${w.brand}, ${w.salonName} is live`;
  const row = (k: string, v: string) => `<tr><td style="padding:6px 0;color:#67635b;font-size:14px;width:120px">${esc(k)}</td><td style="padding:6px 0;font-size:14px;font-weight:600">${v}</td></tr>`;
  const body = `
<h1 style="margin:0 0 8px 0;font-size:24px;line-height:30px">Welcome, ${esc(first)}!</h1>
<p style="margin:0;font-size:15px;line-height:23px;color:#3d3a34"><b>${esc(w.salonName)}</b> is ready on ${esc(w.brand)}. Your free Pro Max trial runs until <b>${esc(ends)}</b>, with everything switched on.</p>
${button(w.salonUrl, "Open your salon")}
<table role="presentation" cellpadding="0" cellspacing="0" style="border-top:1px solid #ece6d9;border-bottom:1px solid #ece6d9;width:100%;margin:4px 0 20px 0">
${row("Your address", `<a href="${esc(w.salonUrl)}" style="color:#1f7a6a">${esc(w.salonUrl.replace(/^https?:\/\//, "").replace(/\/$/, ""))}</a>`)}
${row("Salon ID", esc(w.slug))}
${row("Sign in with", esc(w.username))}
${row("Trial ends", esc(ends))}
</table>
<p style="margin:0 0 8px 0;font-size:15px;font-weight:600">Get set up in five minutes</p>
<ol style="margin:0;padding-left:20px;font-size:14px;line-height:24px;color:#3d3a34">
<li>Upload your logo and check your VAT in Settings</li>
<li>Add your services and prices</li>
<li>Add your barbers and their commission</li>
<li>Ring up your first bill</li>
</ol>
<p style="margin:20px 0 0 0;font-size:14px;line-height:22px;color:#67635b">Before the trial ends you can pick Free, Pro or Pro Max. ${w.supportEmail ? `Questions? Just reply or write to <a href="mailto:${esc(w.supportEmail)}" style="color:#1f7a6a">${esc(w.supportEmail)}</a>.` : "Questions? Just reply to this email."}</p>`;
  const html = emailLayout({
    brand: w.brand,
    siteUrl: w.siteUrl,
    preheader: `${w.salonName} is live. Your free trial runs until ${ends}.`,
    body,
    footer: `You're getting this because you created ${esc(w.salonName)} on ${esc(w.brand)}.`,
  });
  const text = [
    `Welcome, ${first}!`,
    ``,
    `${w.salonName} is ready on ${w.brand}. Your free Pro Max trial runs until ${ends}.`,
    ``,
    `Open your salon: ${w.salonUrl}`,
    `Salon ID: ${w.slug}`,
    `Sign in with: ${w.username}`,
    ``,
    `Get set up: upload your logo, add services and prices, add your barbers, ring up your first bill.`,
  ].join("\n");
  return { subject, html, text };
}
