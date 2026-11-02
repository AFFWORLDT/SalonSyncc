/** Defaults for a new salon by country (ISO 3166 alpha-2). The owner can change every one in Settings. */
export interface CountryDefaults {
  currency: string;
  currency_minor: number;
  timezone: string;
  locale: string;
  phone_country: string;
}

export const COUNTRY_DEFAULTS: Record<string, CountryDefaults & { name: string }> = {
  AE: { name: "United Arab Emirates", currency: "AED", currency_minor: 100, timezone: "Asia/Dubai", locale: "en-AE", phone_country: "971" },
  SA: { name: "Saudi Arabia", currency: "SAR", currency_minor: 100, timezone: "Asia/Riyadh", locale: "en-SA", phone_country: "966" },
  QA: { name: "Qatar", currency: "QAR", currency_minor: 100, timezone: "Asia/Qatar", locale: "en-QA", phone_country: "974" },
  KW: { name: "Kuwait", currency: "KWD", currency_minor: 1000, timezone: "Asia/Kuwait", locale: "en-KW", phone_country: "965" },
  OM: { name: "Oman", currency: "OMR", currency_minor: 1000, timezone: "Asia/Muscat", locale: "en-OM", phone_country: "968" },
  BH: { name: "Bahrain", currency: "BHD", currency_minor: 1000, timezone: "Asia/Bahrain", locale: "en-BH", phone_country: "973" },
  IN: { name: "India", currency: "INR", currency_minor: 100, timezone: "Asia/Kolkata", locale: "en-IN", phone_country: "91" },
  PK: { name: "Pakistan", currency: "PKR", currency_minor: 100, timezone: "Asia/Karachi", locale: "en-PK", phone_country: "92" },
  BD: { name: "Bangladesh", currency: "BDT", currency_minor: 100, timezone: "Asia/Dhaka", locale: "en-BD", phone_country: "880" },
  EG: { name: "Egypt", currency: "EGP", currency_minor: 100, timezone: "Africa/Cairo", locale: "en-EG", phone_country: "20" },
  GB: { name: "United Kingdom", currency: "GBP", currency_minor: 100, timezone: "Europe/London", locale: "en-GB", phone_country: "44" },
  US: { name: "United States", currency: "USD", currency_minor: 100, timezone: "America/New_York", locale: "en-US", phone_country: "1" },
};

/** The defaults for `cc`; unknown countries get the UAE set (the product's home market). */
export function countryDefaults(cc: string): CountryDefaults & { country: string } {
  const key = cc.toUpperCase();
  const d = COUNTRY_DEFAULTS[key] ?? COUNTRY_DEFAULTS.AE!;
  const { name: _name, ...rest } = d;
  return { ...rest, country: COUNTRY_DEFAULTS[key] ? key : "AE" };
}

/** Bill number prefix from the salon ID: its first 3 letters/digits, upper case ("beard-co" -> "BEA"). */
export function billPrefixFor(slug: string): string {
  return slug.replace(/[^a-z0-9]/gi, "").slice(0, 3).toUpperCase() || "SK";
}
