/**
 * Where to go after signing in: `?next=` when it is a path on this site (the AI connect consent page sends people here
 * and wants them back), else home. Parsed as a URL against this origin, so "//x", "/\x", control characters (browsers drop
 * tabs and newlines, turning "/\t/x" into "//x") and full URLs never leave the site.
 */
export function nextPath(search: string, origin = typeof window !== "undefined" ? window.location.origin : "https://localhost"): string {
  const n = new URLSearchParams(search).get("next");
  if (!n || !n.startsWith("/") || /[\u0000-\u001f\u007f\\]/.test(n)) return "/";
  let u: URL;
  try {
    u = new URL(n, origin);
  } catch {
    return "/";
  }
  if (u.origin !== origin || u.pathname.startsWith("/login")) return "/";
  return u.pathname + u.search + u.hash;
}
