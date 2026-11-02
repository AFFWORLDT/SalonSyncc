/** Same rules as the API (core/tenant.ts): 3-30 of a-z 0-9 -, not starting or ending with "-". */
export const SLUG_RE = /^[a-z0-9](?:[a-z0-9-]{1,28}[a-z0-9])$/;

export function normalizeSlug(s: string): string {
  return s.trim().toLowerCase().replace(/[\s_]+/g, "-");
}

/** A salon ID suggested from the salon's name: "Beard & Co. Salon" -> "beard-co-salon". */
export function suggestSlug(name: string): string {
  return name
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 30)
    .replace(/-+$/g, "");
}
