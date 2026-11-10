/** Build-time brand values (white label). */
export const BRAND_NAME = process.env.NEXT_PUBLIC_BRAND_NAME || "SalonKit";
/** e.g. "salonkit.online"; salons live at <salon-id>.<ROOT_DOMAIN>. */
export const ROOT_DOMAIN = process.env.NEXT_PUBLIC_ROOT_DOMAIN || "";
export const SUPPORT_EMAIL = process.env.NEXT_PUBLIC_SUPPORT_EMAIL || "";
export const COMPANY = "AFFWORLD FZ-LLC";
/** The office, the same one PropFusion lists. */
export const OFFICE = { street: "2704, Prime Tower, Burj Khalifa Street", area: "Business Bay", locality: "Dubai", country: "AE" };
export const OFFICE_ADDRESS = `${OFFICE.street}, ${OFFICE.area}, ${OFFICE.locality}, UAE`;
export const OFFICE_MAPS_URL = "https://maps.app.goo.gl/zeyfsVePRoKyTKTy7";

/** Where a salon signs in: its own subdomain, or the app's login with ?org= when there is no root domain (local). */
export function salonLoginUrl(slug: string): string {
  return ROOT_DOMAIN ? `https://${slug}.${ROOT_DOMAIN}/login/` : `http://localhost:8787/login/?org=${encodeURIComponent(slug)}`;
}
