/** Shared HTML frame for platform emails: cream card, deep green button, SalonKit mark (inline styles only). */
export function esc(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
}

export function emailLayout(o: { brand: string; siteUrl: string; preheader: string; body: string; footer: string }): string {
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(o.brand)}</title></head>
<body style="margin:0;padding:0;background:#f6f2e9;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#1c1b18">
<span style="display:none;max-height:0;overflow:hidden;opacity:0">${esc(o.preheader)}</span>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f6f2e9;padding:32px 12px"><tr><td align="center">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px">
<tr><td style="padding:0 0 20px 0" align="left">
  <a href="${esc(o.siteUrl)}" style="text-decoration:none;color:#1c1b18;font-weight:600;font-size:18px">
    <img src="${esc(o.siteUrl)}/icon-192.png" width="36" height="36" alt="" style="vertical-align:middle;border-radius:10px;margin-right:8px">${esc(o.brand)}
  </a>
</td></tr>
<tr><td style="background:#fffdf8;border:1px solid #e0d9cb;border-radius:16px;padding:32px 28px">${o.body}</td></tr>
<tr><td style="padding:20px 8px;color:#67635b;font-size:12px;line-height:18px" align="center">${o.footer}</td></tr>
</table></td></tr></table></body></html>`;
}

export function button(href: string, label: string): string {
  return `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:24px 0"><tr><td style="background:#1f7a6a;border-radius:999px">
<a href="${esc(href)}" style="display:inline-block;padding:14px 28px;color:#fffdf8;text-decoration:none;font-weight:600;font-size:15px">${esc(label)}</a></td></tr></table>`;
}
