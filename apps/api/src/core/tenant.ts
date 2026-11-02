/**
 * Tenant resolver: extract salon slug from host name
 */

export const SLUG_RE = /^[a-z0-9](?:[a-z0-9-]{1,28}[a-z0-9])$/;

/**
 * Normalize a slug: trim, lowercase, collapse spaces and underscores to single dash
 */
export function normalizeSlug(s: string): string {
  return s
    .trim()
    .toLowerCase()
    .replace(/[\s_]+/g, "-");
}

/**
 * Check if a string is a valid slug
 */
export function isValidSlug(s: string): boolean {
  return SLUG_RE.test(s);
}

/**
 * Extract tenant slug from host name
 *
 * Examples:
 * - "beardsalon.salonstation.online" → { kind: "tenant", slug: "beardsalon" }
 * - "admin.salonstation.online" → { kind: "admin" }
 * - "www.salonstation.online" → { kind: "none" }
 * - "salonstation.online" → { kind: "none" }
 * - "" (empty rootDomain) → { kind: "none" }
 */
export function slugFromHost(
  host: string,
  rootDomain: string,
  adminHost: string
): { kind: "tenant"; slug: string } | { kind: "admin" } | { kind: "none" } {
  // Normalize config inputs: lowercase and strip trailing dot from rootDomain
  let normalizedRootDomain = rootDomain.toLowerCase();
  if (normalizedRootDomain.endsWith(".")) {
    normalizedRootDomain = normalizedRootDomain.slice(0, -1);
  }
  const normalizedAdminHost = adminHost.toLowerCase();

  // Return none if rootDomain is empty (workers.dev mode)
  if (!normalizedRootDomain) {
    return { kind: "none" };
  }

  // Normalize host: strip port and trailing dot, then lowercase
  let normalized = host;

  // Strip port (everything after :)
  const portIndex = normalized.lastIndexOf(":");
  if (portIndex !== -1) {
    // Check if what comes after : is a port number
    const afterColon = normalized.substring(portIndex + 1);
    if (/^\d+$/.test(afterColon)) {
      normalized = normalized.substring(0, portIndex);
    }
  }

  // Strip trailing dot
  if (normalized.endsWith(".")) {
    normalized = normalized.slice(0, -1);
  }

  // Lowercase
  normalized = normalized.toLowerCase();

  // If normalized host is exactly the root domain, return none (bare root)
  if (normalized === normalizedRootDomain) {
    return { kind: "none" };
  }

  // Check if host ends with "." + rootDomain
  const suffix = "." + normalizedRootDomain;
  if (!normalized.endsWith(suffix)) {
    return { kind: "none" };
  }

  // Extract the label(s) before the root domain
  const label = normalized.substring(0, normalized.length - suffix.length);

  // Return none if label is empty
  if (!label) {
    return { kind: "none" };
  }

  // Check if more than one label deep (contains a dot)
  if (label.includes(".")) {
    return { kind: "none" };
  }

  // Check if label is "www"
  if (label === "www") {
    return { kind: "none" };
  }

  // Check if label equals adminHost (only if adminHost is non-empty)
  if (normalizedAdminHost && label === normalizedAdminHost) {
    return { kind: "admin" };
  }

  // Check if label is a valid slug
  if (!isValidSlug(label)) {
    return { kind: "none" };
  }

  // Valid tenant
  return { kind: "tenant", slug: label };
}
