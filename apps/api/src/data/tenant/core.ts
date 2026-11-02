/** Tables whose rows belong to a salon. The SQL guard test requires every statement touching these to be org_id scoped. Later plans extend this list. */
export const TENANT_TABLES = ["users", "counters", "login_failures", "org_settings", "services", "audit_log"] as const;

export interface UserRow {
  id: number;
  org_id: string;
  username: string;
  name: string;
  role: "owner" | "admin" | "barber";
  password_hash: string;
  active: 0 | 1;
  session_version: number;
}

export interface OrgSettings {
  orgId: string;
  displayName: string;
  legalName: string | null;
  logoUrl: string | null;
  brandColor: string | null;
  currency: string;
  currencyMinor: number;
  locale: string;
  timezone: string;
  dayStartHour: number;
  phoneCountry: string;
  billPrefix: string;
  vatEnabled: boolean;
  vatRate: number;
  trn: string | null;
  licenceNo: string | null;
  contactPhone: string | null;
  address: string | null;
  instagramUrl: string | null;
  googleReviewUrl: string | null;
}

const USER_COLS = "id, org_id, username, name, role, password_hash, active, session_version";

/** Every query here is scoped by org_id; tests/sql-guard.test.ts enforces it. */
export function tenantRepo(db: D1Database, orgId: string) {
  return {
    userByUsername(username: string): Promise<UserRow | null> {
      return db
        .prepare(`SELECT ${USER_COLS} FROM users WHERE org_id = ? AND username = ?`)
        .bind(orgId, username)
        .first<UserRow>();
    },
    userById(id: number): Promise<UserRow | null> {
      return db
        .prepare(`SELECT ${USER_COLS} FROM users WHERE org_id = ? AND id = ?`)
        .bind(orgId, id)
        .first<UserRow>();
    },
    async settings(): Promise<OrgSettings> {
      const r = await db
        .prepare("SELECT * FROM org_settings WHERE org_id = ?")
        .bind(orgId)
        .first<Record<string, any>>();
      if (!r) throw new Error(`org_settings missing for ${orgId}`);
      return {
        orgId: r.org_id,
        displayName: r.display_name,
        legalName: r.legal_name,
        logoUrl: r.logo_url,
        brandColor: r.brand_color,
        currency: r.currency,
        currencyMinor: r.currency_minor,
        locale: r.locale,
        timezone: r.timezone,
        dayStartHour: r.day_start_hour,
        phoneCountry: r.phone_country,
        billPrefix: r.bill_prefix,
        vatEnabled: r.vat_enabled === 1,
        vatRate: r.vat_rate,
        trn: r.trn,
        licenceNo: r.licence_no,
        contactPhone: r.contact_phone,
        address: r.address,
        instagramUrl: r.instagram_url,
        googleReviewUrl: r.google_review_url,
      };
    },
    async nextSeq(name: string): Promise<number> {
      const r = await db
        .prepare(
          "INSERT INTO counters(org_id,name,value) VALUES(?,?,1) ON CONFLICT(org_id,name) DO UPDATE SET value=value+1 RETURNING value",
        )
        .bind(orgId, name)
        .first<{ value: number }>();
      return r!.value;
    },
  };
}
