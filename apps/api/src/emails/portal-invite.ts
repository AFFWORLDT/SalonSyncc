import { button, emailLayout, esc } from "./layout";

export interface PortalInvite {
  brand: string;
  siteUrl: string; // https://salonkit.online
  portalUrl: string; // https://admin.salonkit.online/platform/login/
  email: string;
  password: string;
  role: "owner" | "support";
  invitedBy: string;
}

const ROLE: Record<PortalInvite["role"], { label: string; can: string[] }> = {
  owner: {
    label: "Owner",
    can: [
      "See every salon, its staff, usage and billing",
      "Change plans, extend trials, mark salons paid, turn salons off or delete them",
      "Edit plans, feature bundles and the phone app's versions",
      "Send push notifications to salon staff",
      "Add or remove people on the portal team",
    ],
  },
  support: {
    label: "Support",
    can: [
      "See every salon, its staff, usage and billing",
      "Sign in as a salon to help its owner (a 2-hour support session)",
      "Look, but not change plans, delete salons, or send notifications",
    ],
  },
};

/**
 * Sent when someone is added to the Atlantic Portal team: the link, their sign-in and the password the owner set,
 * what their role can do, and to keep it to themselves. The password is in it because the owner chose it for them;
 * the email asks them to change it after signing in.
 */
export function portalInviteEmail(p: PortalInvite): { subject: string; html: string; text: string } {
  const r = ROLE[p.role];
  const subject = `Your ${p.brand} Atlantic Portal access`;
  const row = (k: string, v: string) => `<tr><td style="padding:6px 0;color:#67635b;font-size:14px;width:120px">${esc(k)}</td><td style="padding:6px 0;font-size:14px;font-weight:600">${v}</td></tr>`;
  const host = p.portalUrl.replace(/^https?:\/\//, "").replace(/\/platform\/login\/?$/, "");
  const body = `
<h1 style="margin:0 0 8px 0;font-size:24px;line-height:30px">You're on the Atlantic Portal team</h1>
<p style="margin:0;font-size:15px;line-height:23px;color:#3d3a34">${esc(p.invitedBy)} added you to <b>Atlantic Portal</b>, the control room for every salon on ${esc(p.brand)}: salons, plans, usage statistics, app versions and notifications.</p>
${button(p.portalUrl, "Open Atlantic Portal")}
<table role="presentation" cellpadding="0" cellspacing="0" style="border-top:1px solid #ece6d9;border-bottom:1px solid #ece6d9;width:100%;margin:4px 0 20px 0">
${row("Portal", `<a href="${esc(p.portalUrl)}" style="color:#1f7a6a">${esc(host)}</a>`)}
${row("Email", esc(p.email))}
${row("Password", `<span style="font-family:Menlo,Consolas,monospace">${esc(p.password)}</span>`)}
${row("Role", esc(r.label))}
</table>
<p style="margin:0 0 8px 0;font-size:15px;font-weight:600">As ${esc(r.label === "Owner" ? "an owner" : "support")}, you can</p>
<ul style="margin:0;padding-left:20px;font-size:14px;line-height:24px;color:#3d3a34">
${r.can.map((c) => `<li>${esc(c)}</li>`).join("\n")}
</ul>
<div style="margin:24px 0 0 0;padding:14px 16px;border-radius:12px;background:#fdecea;color:#8a1c14;font-size:14px;line-height:22px">
<b>Keep this to yourself.</b> Don't share this email, your password or your access with anyone, not even someone on the team: each person gets their own account. Change your password after you first sign in (Team &rarr; Your password), and delete this email once you have.
</div>`;
  const html = emailLayout({
    brand: p.brand,
    siteUrl: p.siteUrl,
    preheader: `Your Atlantic Portal sign-in. Don't share it with anyone.`,
    body,
    footer: `You're getting this because ${esc(p.invitedBy)} added you to the ${esc(p.brand)} Atlantic Portal team. If you weren't expecting it, tell them.`,
  });
  const text = [
    `You're on the Atlantic Portal team`,
    ``,
    `${p.invitedBy} added you to Atlantic Portal, the control room for every salon on ${p.brand}.`,
    ``,
    `Portal: ${p.portalUrl}`,
    `Email: ${p.email}`,
    `Password: ${p.password}`,
    `Role: ${r.label}`,
    ``,
    `You can:`,
    ...r.can.map((c) => `- ${c}`),
    ``,
    `KEEP THIS TO YOURSELF. Don't share this email, your password or your access with anyone. Each person gets their own account.`,
    `Change your password after you first sign in (Team > Your password), then delete this email.`,
  ].join("\n");
  return { subject, html, text };
}
