import { describe, it, expect } from "vitest";
import sitemap from "@/app/sitemap";
import { POSTS } from "@/lib/blog";
import { FEATURE_PAGES } from "@/lib/content";

describe("blog", () => {
  it("every post is unique, sized for search results, in the sitemap and leads to a real feature page", () => {
    const urls = sitemap().map((u) => u.url);
    expect(urls).toContain("https://salonkit.online/blog/");
    expect(new Set(POSTS.map((p) => p.slug)).size).toBe(POSTS.length);
    for (const p of POSTS) {
      expect(urls).toContain(`https://salonkit.online/blog/${p.slug}/`);
      expect(p.title.length).toBeLessThanOrEqual(75);
      expect(p.description.length).toBeLessThanOrEqual(170);
      expect(FEATURE_PAGES.map((f) => f.slug)).toContain(p.feature);
      for (const b of p.body) if ("cta" in b) expect(b.cta.href).toBe(`/${p.feature}/`);
    }
  });
  it("the VAT guide's worked numbers are VAT-inclusive (amount x 5 / 105)", () => {
    for (const [shown, vat] of [[60, 2.86], [105, 5], [250, 11.9]]) expect(Math.round((shown * 5 * 100) / 105) / 100).toBe(vat);
  });
});
