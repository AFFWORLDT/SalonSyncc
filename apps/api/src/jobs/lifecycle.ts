/**
 * The subscription lifecycle (spec §6), run by the cron every hour (minute 0):
 *
 *   trial ──trial_ends_at──▶ grace ──grace_ends_at──▶ expired          (Free trials become active: Free is permanent)
 *   active (paid by hand) ──current_period_end──▶ past_due (7 days) ──▶ expired
 *
 * Moves are idempotent (each UPDATE only matches orgs still in the old state) and each is audited in platform_audit as
 * "system", in the same batch, by an INSERT … SELECT over the same WHERE, written just before its UPDATE.
 * Nothing is ever deleted automatically: expired salons wait in the super admin's Expired queue.
 *
 * Then lifecycle emails, each at most once per salon (email_log UNIQUE (org_id, kind)):
 *   trial_ending (2 days before the trial ends) · grace_reminder_1..7 (one per grace day) · expired · deactivated
 * Free-plan budget: moves LIFECYCLE_MOVE_STMTS; emails 1 (due list) + 2 per email (claim, mark) and 1 subrequest each.
 */
import type { Env } from "../env";
import { services } from "../core/services";
import { invalidateFeatures } from "../core/features-cache";
import { lifecycleEmail, type LifecycleKind } from "../emails/lifecycle";

const DAY = 86_400_000;
export const GRACE_MS = 7 * DAY;
/** Statements one lifecycle move pass costs (an audit INSERT + an UPDATE per move, 4 moves). */
export const LIFECYCLE_MOVE_STMTS = 8;
/** Emails sent per tick at most (each: 1 subrequest + 2 statements). */
export const LIFECYCLE_EMAILS_PER_TICK = 5;
export const lifecycleEmailStmts = (n: number) => 1 + 2 * n;

interface Move {
  action: string;
  from: string;
  to: string;
  where: string;
  set: string;
}

/** ?1 = now. Each WHERE names the old state, so a second run (or a racing tick) changes nothing. */
const MOVES: Move[] = [
  { action: "trial_ended", from: "trial", to: "grace", where: "status = 'trial' AND plan_id != 'free' AND trial_ends_at IS NOT NULL AND trial_ends_at <= ?1", set: "status = 'grace', grace_ends_at = MAX(COALESCE(grace_ends_at, 0), ?1 + 604800000)" },
  { action: "trial_ended", from: "trial", to: "active", where: "status = 'trial' AND plan_id = 'free' AND trial_ends_at IS NOT NULL AND trial_ends_at <= ?1", set: "status = 'active'" },
  {
    action: "paid_period_ended",
    from: "active",
    to: "past_due",
    where: "status = 'active' AND plan_id != 'free' AND id IN (SELECT org_id FROM subscriptions WHERE provider = 'manual' AND current_period_end IS NOT NULL AND current_period_end <= ?1)",
    set: "status = 'past_due', grace_ends_at = ?1 + 604800000",
  },
  { action: "grace_ended", from: "grace", to: "expired", where: "status IN ('grace', 'past_due') AND grace_ends_at IS NOT NULL AND grace_ends_at <= ?1", set: "status = 'expired'" },
];

/** Applies every due state move in ONE batch (LIFECYCLE_MOVE_STMTS statements). Returns the orgs moved. */
export async function runLifecycleMoves(env: Env, at: number): Promise<string[]> {
  const stmts: D1PreparedStatement[] = [];
  for (const m of MOVES) {
    stmts.push(
      env.DB.prepare(
        `INSERT INTO platform_audit(who,action,org_id,before_json,after_json,at) SELECT 'system', ?2, id, json_object('status', status), json_object('status', ?3), ?1 FROM orgs WHERE ${m.where}`,
      ).bind(at, m.action, m.to),
    );
    stmts.push(env.DB.prepare(`UPDATE orgs SET ${m.set} WHERE ${m.where} RETURNING id`).bind(at));
  }
  const res = await env.DB.batch<{ id: string }>(stmts);
  const moved = res.filter((_, i) => i % 2 === 1).flatMap((r) => r.results.map((x) => x.id));
  moved.forEach(invalidateFeatures);
  return moved;
}

/** The lifecycle email each salon is due, if any (one statement for all salons). ?1 = now. */
const DUE_SQL = `
WITH k AS (
  SELECT o.id, o.slug, o.name, o.status, o.trial_ends_at, o.grace_ends_at, o.owner_email,
    CASE
      WHEN o.status = 'trial' AND o.plan_id != 'free' AND o.trial_ends_at IS NOT NULL AND o.trial_ends_at > ?1 AND o.trial_ends_at <= ?1 + 172800000 THEN 'trial_ending'
      WHEN o.status IN ('grace', 'past_due') AND o.grace_ends_at IS NOT NULL AND o.grace_ends_at > ?1
        THEN 'grace_reminder_' || MIN(7, MAX(1, 7 - CAST((o.grace_ends_at - ?1 - 1) / 86400000 AS INTEGER)))
      WHEN o.status = 'expired' THEN 'expired'
      WHEN o.status = 'deactivated' THEN 'deactivated'
    END AS kind
  FROM orgs o
  WHERE o.owner_email IS NOT NULL AND o.status IN ('trial', 'grace', 'past_due', 'expired', 'deactivated')
)
SELECT k.* FROM k WHERE k.kind IS NOT NULL AND NOT EXISTS (SELECT 1 FROM email_log e WHERE e.org_id = k.id AND e.kind = k.kind)
ORDER BY k.id LIMIT ?2`;

export interface DueEmail {
  id: string;
  slug: string;
  name: string;
  status: string;
  trial_ends_at: number | null;
  grace_ends_at: number | null;
  owner_email: string;
  kind: string;
}

/** Sends up to `limit` due lifecycle emails; each is claimed in email_log first, so it goes out once. Returns how many sends were attempted (subrequests used). */
export async function runLifecycleEmails(env: Env, at: number, limit: number): Promise<number> {
  if (limit <= 0) return 0;
  const { results } = await env.DB.prepare(DUE_SQL).bind(at, limit).all<DueEmail>();
  let n = 0;
  for (const d of results) {
    const claim = await env.DB.prepare(`INSERT OR IGNORE INTO email_log(org_id,kind,"to",status) VALUES(?,?,?,'queued')`).bind(d.id, d.kind, d.owner_email).run();
    if (!claim.meta.changes) continue;
    const configured = !!env.RESEND_API_KEY && !!env.MAIL_FROM;
    if (configured) n++; // a real send costs one subrequest
    const root = env.ROOT_DOMAIN;
    const salonUrl = root ? `https://${d.slug}.${root}/` : `${env.APP_ORIGIN}/login/?org=${encodeURIComponent(d.slug)}`;
    const mail = lifecycleEmail({
      kind: d.kind.startsWith("grace_reminder_") ? "grace_reminder" : (d.kind as LifecycleKind),
      brand: env.BRAND_NAME,
      siteUrl: root ? `https://${root}` : env.APP_ORIGIN,
      salonName: d.name,
      salonUrl,
      trialEndsAt: d.trial_ends_at,
      graceEndsAt: d.grace_ends_at,
      now: at,
      supportEmail: env.SUPPORT_EMAIL,
    });
    const ok = configured && (await services(env).mail.send(env, { to: d.owner_email, ...mail, replyTo: env.SUPPORT_EMAIL || undefined }));
    await env.DB.prepare("UPDATE email_log SET status = ?3, sent_at = CASE WHEN ?3 = 'sent' THEN ?4 ELSE sent_at END WHERE org_id = ?1 AND kind = ?2")
      .bind(d.id, d.kind, ok ? "sent" : configured ? "failed" : "skipped", at)
      .run();
  }
  return n;
}
