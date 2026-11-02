/** What a key of the on-screen number pad does to the text of the field being typed into. */
export type PadKey = "0" | "1" | "2" | "3" | "4" | "5" | "6" | "7" | "8" | "9" | "00" | "." | "⌫" | "C";
export type PadMode = "money" | "digits";

import { getFormat, minorDigits } from "./format";

const MAX_WHOLE = 6; // 999,999 in the salon currency
const MAX_DIGITS = 12; // longest mobile number without the country code

/**
 * The new text after a key. `fresh` means the field was just selected: the first digit or dot
 * replaces the old value, as if it were highlighted.
 */
export function applyKey(value: string, key: string, mode: PadMode, fresh = false, decimals = minorDigits(getFormat().minor)): string {
  if (key === "C") return "";
  if (key === "⌫") return value.slice(0, -1);
  const base = fresh ? "" : value;
  if (key === ".") {
    if (mode === "money" && decimals === 0) return base || value; // a currency without minor units has no decimal point
    if (mode === "digits" || base.includes(".")) return base === "" && mode === "money" ? "0." : base || value;
    return base === "" ? "0." : `${base}.`;
  }
  if (!/^\d+$/.test(key)) return value;
  let out = base;
  for (const d of key) {
    if (mode === "digits") {
      if (out.length >= MAX_DIGITS) break;
      out += d;
      continue;
    }
    const [whole, dec] = out.split(".");
    if (dec !== undefined) {
      if (dec.length >= decimals) break;
      out += d;
    } else if (whole === "0" || whole === "") {
      out = d === "0" && whole === "0" ? "0" : d;
    } else if (whole.length < MAX_WHOLE) {
      out += d;
    }
  }
  return out;
}
