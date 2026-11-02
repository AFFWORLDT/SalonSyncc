/** FM whatsapp.ts firstName: the first word of a customer name; "there" for blank or a walk-in label ("Customer 3"). */
export function firstName(label: string | null | undefined): string {
  const s = (label ?? "").trim();
  if (!s || /^Customer \d+$/.test(s)) return "there";
  return s.split(/\s+/)[0]!;
}
