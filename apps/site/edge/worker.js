// The site's front door: one address per page for Google. http:// and www. move permanently to https://salonkit.online,
// and the static assets' own redirects (/pricing -> /pricing/, /index.html -> /) are made permanent (308) instead of 307.
export const CANONICAL_HOST = "salonkit.online";

export function canonicalRedirect(url, host = CANONICAL_HOST) {
  if (url.protocol === "https:" && url.hostname === host) return null;
  if (url.hostname !== host && url.hostname !== `www.${host}`) return null;
  const to = new URL(url);
  to.protocol = "https:";
  to.hostname = host;
  to.port = "";
  return to.href;
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const to = canonicalRedirect(url);
    if (to) return Response.redirect(to, 301);
    const res = await env.ASSETS.fetch(request);
    if (res.status === 307 || res.status === 302) {
      const loc = res.headers.get("location");
      if (loc) return new Response(null, { status: 308, headers: { location: new URL(loc, url).href } });
    }
    return res;
  },
};
