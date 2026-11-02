/**
 * Phones for one org's calling code (digits only, e.g. "971", "91"). Pure.
 * 971 keeps FM's rules: local numbers are stored 05XXXXXXXX / 0[234679]XXXXXXX, foreign ones as +digits.
 * Any other code: stored as +<cc><national without leading 0>; a + or 00 prefix is kept as +digits.
 */
/** National (significant) number length per calling code, used to tell "91XXXXXXXXXX" from a national number. */
export const NATIONAL_LENGTHS: Record<string, number> = { "91": 10, "92": 10, "880": 10, "966": 9, "974": 8, "965": 8, "968": 8, "973": 8, "44": 10, "1": 10, "20": 10, "977": 10 };

export function canonicalPhone(raw: unknown, callingCode: string): string | null {
  if (typeof raw !== "string") return null;
  const s = raw.replace(/[\s\-().]/g, "");
  if (!s) return null;
  let intl: string | null = null;
  if (s.startsWith("+")) intl = s.slice(1);
  else if (s.startsWith("00")) intl = s.slice(2);
  const uae = callingCode === "971";
  if (intl !== null) {
    if (!(uae ? /^\d{8,15}$/ : /^\d{6,15}$/).test(intl)) return null;
    if (uae && intl.startsWith("971")) return uaeLocal(intl.slice(3));
    return `+${intl}`;
  }
  if (!/^\d+$/.test(s)) return null;
  if (uae) {
    if (s.startsWith("971") && s.length === 12) return uaeLocal(s.slice(3));
    return uaeLocal(s.startsWith("0") ? s.slice(1) : s);
  }
  let national = s.startsWith("0") ? s.slice(1) : s;
  const len = NATIONAL_LENGTHS[callingCode];
  if (len !== undefined) {
    if (national.startsWith(callingCode) && national.length === callingCode.length + len) national = national.slice(callingCode.length);
    if (national.length !== len) return null;
  } else if (national.length < 6 || national.length > 14) return null;
  return `+${callingCode}${national}`;
}

function uaeLocal(rest: string): string | null {
  if (/^5\d{8}$/.test(rest)) return `0${rest}`;
  if (/^[234679]\d{7}$/.test(rest)) return `0${rest}`;
  return null;
}

/** Canonical phone -> digits for https://wa.me/<digits>. */
export function whatsappDigits(phone: string, callingCode: string): string {
  return phone.startsWith("+") ? phone.slice(1) : `${callingCode}${phone.slice(1)}`;
}
