/** Calling-code data for the phone field. The salon's own country (settings.phone_country) is listed first by countriesFor(). */

export interface Country {
  code: string; // dial code without +
  label: string;
  /** Validates the national number (digits only, no leading 0). */
  test: (n: string) => boolean;
  example: string;
}

/** The countries most customers come from; countriesFor() moves the salon's own country to the top. */
export const COUNTRIES: Country[] = [
  { code: "971", label: "UAE +971", test: (n) => /^5\d{8}$/.test(n) || /^[234679]\d{7}$/.test(n), example: "50 123 4567" },
  { code: "91", label: "India +91", test: (n) => /^[6-9]\d{9}$/.test(n), example: "98765 43210" },
  { code: "92", label: "Pakistan +92", test: (n) => /^3\d{9}$/.test(n), example: "300 1234567" },
  { code: "880", label: "Bangladesh +880", test: (n) => /^1\d{9}$/.test(n), example: "1712 345678" },
  { code: "977", label: "Nepal +977", test: (n) => /^9\d{9}$/.test(n), example: "984 1234567" },
  { code: "94", label: "Sri Lanka +94", test: (n) => /^7\d{8}$/.test(n), example: "71 234 5678" },
  { code: "63", label: "Philippines +63", test: (n) => /^9\d{9}$/.test(n), example: "917 123 4567" },
  { code: "20", label: "Egypt +20", test: (n) => /^1\d{9}$/.test(n), example: "100 123 4567" },
  { code: "966", label: "Saudi +966", test: (n) => /^5\d{8}$/.test(n), example: "50 123 4567" },
  { code: "968", label: "Oman +968", test: (n) => /^[79]\d{7}$/.test(n), example: "9123 4567" },
  { code: "974", label: "Qatar +974", test: (n) => /^[3567]\d{7}$/.test(n), example: "3312 3456" },
  { code: "965", label: "Kuwait +965", test: (n) => /^[569]\d{7}$/.test(n), example: "5012 3456" },
  { code: "973", label: "Bahrain +973", test: (n) => /^3\d{7}$/.test(n), example: "3600 1234" },
  { code: "44", label: "UK +44", test: (n) => /^7\d{9}$/.test(n), example: "7700 900123" },
  { code: "1", label: "USA/Canada +1", test: (n) => /^[2-9]\d{9}$/.test(n), example: "212 555 0123" },
  { code: "", label: "Other (type +code)", test: (n) => /^\d{8,15}$/.test(n), example: "+44 7700 900123" },
];


/** COUNTRIES with the salon's own calling code first. An unknown code still validates via the "Other" entry. */
export function countriesFor(cc: string): Country[] {
  const own = COUNTRIES.find((c) => c.code === cc);
  return own ? [own, ...COUNTRIES.filter((c) => c !== own)] : COUNTRIES;
}

/** UAE salons print a 15-digit TRN on tax invoices (the API enforces it only for calling code 971). */
export function usesUaeTrn(cc: string): boolean {
  return cc === "971";
}
