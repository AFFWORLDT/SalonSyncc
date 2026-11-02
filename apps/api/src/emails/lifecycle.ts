import { button, emailLayout, esc } from "./layout";

export type LifecycleKind = "trial_ending" | "grace_reminder" | "expired" | "deactivated";

export interface LifecycleInput {
  kind: LifecycleKind;
  brand: string;
  siteUrl: string;
  salonName: string;
  salonUrl: string;
  trialEndsAt: number | null;
  graceEndsAt: number | null;
  now: number;
  supportEmail: string;
}

const dateLabel = (ms: number) => new Date(ms).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" });
const daysLeft = (end: number | null, now: number) => (end ? Math.max(0, Math.ceil((end - now) / 86_400_000)) : 0);

/** Trial ending, grace reminders, expired and deactivated emails to the salon owner. */
export function lifecycleEmail(i: LifecycleInput): { subject: string; html: string; text: string } {
  const plan = `${i.salonUrl}plan/`;
  const contact = i.supportEmail ? ` or write to <a href="mailto:${esc(i.supportEmail)}" style="color:#1f7a6a">${esc(i.supportEmail)}</a>` : "";
  let subject: string;
  let lead: string;
  let cta: { href: string; label: string } | null = { href: plan, label: "Choose a plan" };
  if (i.kind === "trial_ending") {
    const d = daysLeft(i.trialEndsAt, i.now);
    subject = `Your ${i.brand} trial ends in ${d} day${d === 1 ? "" : "s"}`;
    lead = `The free trial for <b>${esc(i.salonName)}</b> ends on <b>${esc(dateLabel(i.trialEndsAt ?? i.now))}</b>. Pick a plan to keep everything running. Your bills, customers and reports stay exactly as they are.`;
  } else if (i.kind === "grace_reminder") {
    const d = daysLeft(i.graceEndsAt, i.now);
    subject = `${i.salonName}: ${d} day${d === 1 ? "" : "s"} left to choose a plan`;
    lead = `Your trial has ended, but <b>${esc(i.salonName)}</b> keeps working for <b>${d} more day${d === 1 ? "" : "s"}</b> (until ${esc(dateLabel(i.graceEndsAt ?? i.now))}). After that the salon becomes read-only until you choose a plan.`;
  } else if (i.kind === "expired") {
    subject = `${i.salonName} is paused: choose a plan to continue`;
    lead = `<b>${esc(i.salonName)}</b> is now read-only. You can still sign in, see your reports and export them, but new bills are paused. Nothing has been deleted: pick a plan and you carry on where you left off.`;
  } else {
    subject = `${i.salonName} has been deactivated`;
    lead = `<b>${esc(i.salonName)}</b> has been deactivated, so nobody can sign in for now. Your data is kept. To switch it back on, reply to this email${contact}.`;
    cta = null;
  }
  const body = `
<h1 style="margin:0 0 12px 0;font-size:22px;line-height:28px">${esc(subject)}</h1>
<p style="margin:0;font-size:15px;line-height:23px;color:#3d3a34">${lead}</p>
${cta ? button(cta.href, cta.label) : ""}
<p style="margin:${cta ? "0" : "20px"} 0 0 0;font-size:14px;line-height:22px;color:#67635b">Questions? Just reply to this email${contact}.</p>`;
  const html = emailLayout({ brand: i.brand, siteUrl: i.siteUrl, preheader: subject, body, footer: `You're getting this because you own ${esc(i.salonName)} on ${esc(i.brand)}.` });
  const text = [subject, "", lead.replace(/<[^>]+>/g, ""), "", cta ? `${cta.label}: ${cta.href}` : "", "Questions? Just reply to this email."].filter((l, n, a) => !(l === "" && a[n - 1] === "")).join("\n");
  return { subject, html, text };
}
