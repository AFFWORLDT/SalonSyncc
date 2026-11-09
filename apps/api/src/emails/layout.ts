/**
 * Shared HTML frame for platform emails (inline styles and tables only, so Gmail, Outlook and Apple Mail agree):
 * SalonKit wordmark on top, an optional photo banner with a greeting, a white card, and the wordmark again at the foot.
 */
export function esc(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
}

const GREEN = "#0b4a3a";
const GOLD = "#d9a14e";
const FONT = "-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif";

/** "SalonKit✦" in text, so it shows even with images blocked. */
function wordmark(brand: string, size: number): string {
  return `<span style="font-size:${size}px;font-weight:800;letter-spacing:-0.4px;color:${GREEN}">${esc(brand)}</span><span style="font-size:${Math.round(size * 0.62)}px;color:${GOLD};vertical-align:top">&#10022;</span>`;
}

export interface EmailHero {
  /** First line, e.g. "Hi Pankaj,". */
  greeting: string;
  /** Big line under it; [accent] is shown in gold, e.g. "Welcome to" + "SalonKit!". */
  title: string;
  accent?: string;
  /** One or two short sentences. */
  line?: string;
}

export function emailLayout(o: { brand: string; siteUrl: string; preheader: string; body: string; footer: string; hero?: EmailHero }): string {
  const hero = o.hero
    ? `<tr><td background="${esc(o.siteUrl)}/email/hero.jpg" bgcolor="${GREEN}" style="background-color:${GREEN};background-image:url('${esc(o.siteUrl)}/email/hero.jpg');background-position:right center;background-size:cover;background-repeat:no-repeat;border-radius:18px 18px 0 0;padding:34px 32px 44px">
  <div style="font-size:26px;line-height:32px;font-weight:700;color:#ffffff">${esc(o.hero.greeting)}</div>
  <div style="font-size:30px;line-height:36px;font-weight:400;color:#e9efe9;margin-top:6px">${esc(o.hero.title)}</div>
  ${o.hero.accent ? `<div style="font-size:34px;line-height:40px;font-weight:800;color:${GOLD}">${esc(o.hero.accent)}</div>` : ""}
  <div style="width:44px;height:3px;background:${GOLD};border-radius:2px;margin:16px 0 14px;font-size:0;line-height:0">&nbsp;</div>
  ${o.hero.line ? `<div style="font-size:14px;line-height:21px;color:#dfe9e4;max-width:300px">${esc(o.hero.line)}</div>` : ""}
</td></tr>`
    : "";
  const cardRadius = o.hero ? "0 0 18px 18px" : "18px";
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="light"><title>${esc(o.brand)}</title></head>
<body style="margin:0;padding:0;background:#f3efe6;font-family:${FONT};color:#1c1b18">
<span style="display:none;max-height:0;overflow:hidden;opacity:0">${esc(o.preheader)}</span>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f3efe6;padding:28px 12px"><tr><td align="center">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:580px;background:#fbf8f2;border-radius:22px;box-shadow:0 12px 40px rgba(28,27,24,0.08)">
<tr><td style="padding:22px 28px 18px">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr>
    <td align="left"><a href="${esc(o.siteUrl)}" style="text-decoration:none">${wordmark(o.brand, 24)}</a></td>
    <td align="right" style="font-size:10px;letter-spacing:2.4px;color:#8a857b;font-weight:600">MANAGE &middot; GROW &middot; SUCCEED</td>
  </tr></table>
</td></tr>
<tr><td style="padding:0 14px">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0">
${hero}
<tr><td style="background:#ffffff;border-radius:${cardRadius};padding:30px 28px 28px;font-size:15px;line-height:23px">${o.body}</td></tr>
</table>
</td></tr>
<tr><td style="padding:22px 28px 26px">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr>
    <td align="left" style="white-space:nowrap"><a href="${esc(o.siteUrl)}" style="text-decoration:none">${wordmark(o.brand, 20)}</a></td>
    <td align="right" style="font-size:12px;color:#8a857b">Your salon. Our technology.</td>
  </tr></table>
  ${o.footer ? `<div style="border-top:1px solid #e6dfd1;margin-top:16px;padding-top:14px;color:#8a857b;font-size:12px;line-height:18px;text-align:center">${o.footer}</div>` : ""}
</td></tr>
</table></td></tr></table></body></html>`;
}

/** The main action: a deep green pill. */
export function button(href: string, label: string, center = false): string {
  return `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:22px ${center ? "auto" : "0"}"><tr><td style="background:${GREEN};border-radius:999px;box-shadow:0 8px 18px rgba(11,74,58,0.28)">
<a href="${esc(href)}" style="display:inline-block;padding:15px 34px;color:#ffffff;text-decoration:none;font-weight:700;font-size:16px">${esc(label)}</a></td></tr></table>`;
}

/** A thin rule with a small cream pill in the middle ("Or enter this code"). */
export function pillDivider(label: string): string {
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:6px 0 14px"><tr>
<td valign="middle"><div style="height:1px;background:#e6dfd1;font-size:0;line-height:1px">&nbsp;</div></td>
<td style="padding:0 10px;white-space:nowrap" width="1"><span style="display:inline-block;background:#f3efe6;color:#5f5a51;font-size:13px;padding:5px 14px;border-radius:999px">${esc(label)}</span></td>
<td valign="middle"><div style="height:1px;background:#e6dfd1;font-size:0;line-height:1px">&nbsp;</div></td>
</tr></table>`;
}

/** A one-time code in a soft green box, spaced out so it is easy to read and type. */
export function codeBox(code: string): string {
  return `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:0 auto"><tr><td style="background:#ecf5ef;border:1px solid #d6eadc;border-radius:14px;padding:14px 18px 14px 30px">
<span style="font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;font-size:36px;font-weight:700;letter-spacing:12px;color:${GREEN}">${esc(code)}</span></td></tr></table>`;
}

/** Why the reader got this email, in a soft green box with an envelope. [html] is already escaped. */
export function noticeBox(html: string): string {
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-top:22px"><tr><td style="background:#f1f7f3;border-radius:14px;padding:14px 18px">
<table role="presentation" cellpadding="0" cellspacing="0"><tr>
<td style="font-size:22px;padding-right:14px;border-right:1px solid #d6e3da;color:${GREEN}" valign="middle">&#9993;</td>
<td style="padding-left:14px;font-size:13px;line-height:19px;color:#5f5a51" valign="middle">${html}</td>
</tr></table></td></tr></table>`;
}
