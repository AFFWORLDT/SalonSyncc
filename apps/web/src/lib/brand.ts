/** Build-time brand (white label). Per-salon names, logos and colours come from /api/me settings instead. */
export const BRAND_NAME = process.env.NEXT_PUBLIC_BRAND_NAME || "SalonKit";
/** e.g. "salonkit.online". Empty on workers.dev/localhost, where login asks for the salon ID. */
export const ROOT_DOMAIN = process.env.NEXT_PUBLIC_ROOT_DOMAIN || "";
/** Shown on the Upgrade card until billing exists (Plan 7). Empty: no mailto link. */
export const SUPPORT_EMAIL = process.env.NEXT_PUBLIC_SUPPORT_EMAIL || "";
