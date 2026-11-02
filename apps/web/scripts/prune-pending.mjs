// Dev helper: drops files from brand-guard PENDING once they no longer contain forbidden values.
import { readFileSync, writeFileSync } from "node:fs";
const guard = new URL("../test/brand-guard.test.ts", import.meta.url);
let src = readFileSync(guard, "utf8");
const re = /\["[^"]+", (\/.+?\/i?)\],/g;
const pats = [...src.matchAll(re)].map((m) => eval(m[1]));
src = src.replace(/  "(src\/[^"]+)",\n/g, (line, f) => {
  const text = readFileSync(new URL(`../${f}`, import.meta.url), "utf8");
  return pats.some((p) => p.test(text)) ? line : "";
});
writeFileSync(guard, src);
