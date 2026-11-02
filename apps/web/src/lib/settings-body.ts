import { SETTINGS_INPUT_KEYS, type Settings } from "@ss/contract";

/** The complete PUT /api/settings body (the API replaces every field) from the form state; read-only fields are left out. */
export function settingsBody(s: Settings): Record<string, unknown> {
  return Object.fromEntries(SETTINGS_INPUT_KEYS.map((k) => [k, s[k]]));
}
