/**
 * Where to go after signing in: `?next=` when it is a path on this site (the AI connect consent page sends people here
 * and wants them back), else home. Never another origin ("//x", "/\\x" or a full URL).
 */
export function nextPath(search: string): string {
  const n = new URLSearchParams(search).get("next");
  return n && n.startsWith("/") && !n.startsWith("//") && !n.includes("\\") && !n.startsWith("/login") ? n : "/";
}
