/**
 * Replaces the old FM Salon Worker (fm-salon) once FM runs on SalonKit (spec P1b). Every link FM ever sent — bills,
 * receipts (/r/?t=), rating pages (/rate/?t=), the installed app — keeps working by moving to the same path on
 * fm.salonkit.online. Meta's WhatsApp webhook is proxied rather than redirected, because Meta does not follow
 * redirects; SalonKit checks its signature itself. FM's database is left untouched (rollback = redeploy FM).
 */
export const TARGET = "https://fm.salonkit.online";

export async function handle(req: Request, upstream: typeof fetch = fetch): Promise<Response> {
  const url = new URL(req.url);
  const to = `${TARGET}${url.pathname}${url.search}`;
  if (url.pathname === "/api/wa/webhook") return upstream(new Request(to, req));
  return new Response(null, { status: 302, headers: { location: to, "cache-control": "no-store" } });
}

export default { fetch: (req: Request) => handle(req) };
