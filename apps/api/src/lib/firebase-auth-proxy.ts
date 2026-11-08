/**
 * Firebase Auth's sign-in helper pages served from salonkit.online itself (Firebase's "custom authDomain" via a reverse
 * proxy), so Google's account window says "continue to salonkit.online" instead of salonkit1.firebaseapp.com.
 * Only /__/auth/* and /__/firebase/* on the apex (and www); everything is passed through to <project>.firebaseapp.com
 * unchanged, headers included (the SDK frames /__/auth/iframe, so no X-Frame-Options of ours).
 */
export function firebaseAuthProxyTarget(url: URL, rootDomain: string | undefined, projectId: string | undefined): string | null {
  if (!rootDomain || !projectId) return null;
  if (url.hostname !== rootDomain && url.hostname !== `www.${rootDomain}`) return null;
  if (!url.pathname.startsWith("/__/auth/") && !url.pathname.startsWith("/__/firebase/")) return null;
  return `https://${projectId}.firebaseapp.com${url.pathname}${url.search}`;
}

export async function proxyFirebaseAuth(req: Request, target: string): Promise<Response> {
  const headers = new Headers(req.headers);
  headers.delete("host");
  const res = await fetch(target, { method: req.method, headers, body: req.method === "GET" || req.method === "HEAD" ? undefined : req.body, redirect: "manual" });
  return new Response(res.body, res);
}
