/** Public URL of the org logo at version `v` (null when there is none). ?org= makes it work on workers.dev too. */
export function logoUrl(v: number | null | undefined, slug: string): string | null {
  return v ? `/api/public/logo/${v}?org=${encodeURIComponent(slug)}` : null;
}

/** Org images (org_assets). Every statement is org_id scoped. */
export function assetsRepo(db: D1Database, orgId: string) {
  return {
    /**
     * Stores the logo and returns its new version. The version comes from the org's 'logo_v' counter, so it only
     * ever increases, across clears too (an old cached URL can never show a different picture).
     */
    async setLogo(bytes: ArrayBuffer, type: string): Promise<number> {
      const [, r] = await db.batch<{ v: number }>([
        db.prepare("INSERT INTO counters(org_id,name,value) VALUES(?,'logo_v',1) ON CONFLICT(org_id,name) DO UPDATE SET value=value+1").bind(orgId),
        db
          .prepare(
            `INSERT INTO org_assets(org_id, kind, bytes, type, v)
             VALUES(?1, 'logo', ?2, ?3, (SELECT value FROM counters WHERE org_id = ?1 AND name = 'logo_v'))
             ON CONFLICT(org_id, kind) DO UPDATE SET bytes = excluded.bytes, type = excluded.type, v = excluded.v
             RETURNING v`,
          )
          .bind(orgId, bytes, type),
      ]);
      return r!.results[0]!.v;
    },
    async clearLogo(): Promise<void> {
      await db.prepare("DELETE FROM org_assets WHERE org_id = ? AND kind = 'logo'").bind(orgId).run();
    },
    /** The current logo, whatever its version (the PDF bill); null when the org has none. */
    async currentLogo(): Promise<{ bytes: Uint8Array; type: string } | null> {
      const r = await db
        .prepare("SELECT bytes, type FROM org_assets WHERE org_id = ? AND kind = 'logo'")
        .bind(orgId)
        .first<{ bytes: ArrayBuffer | number[]; type: string }>();
      if (!r) return null;
      return { bytes: r.bytes instanceof ArrayBuffer ? new Uint8Array(r.bytes) : new Uint8Array(r.bytes), type: r.type };
    },
    /** The logo at version `v` (its current version); null otherwise. */
    async logo(v: number): Promise<{ bytes: Uint8Array; type: string } | null> {
      const r = await db
        .prepare("SELECT bytes, type FROM org_assets WHERE org_id = ? AND kind = 'logo' AND v = ?")
        .bind(orgId, v)
        .first<{ bytes: ArrayBuffer | number[]; type: string }>();
      if (!r) return null;
      return { bytes: r.bytes instanceof ArrayBuffer ? new Uint8Array(r.bytes) : new Uint8Array(r.bytes), type: r.type };
    },
  };
}
