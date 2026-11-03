import { describe, it, expect } from "vitest";
import sitemap from "@/app/sitemap";
import { FEATURE_PAGES, HOME_FAQS, faqJsonLd } from "@/lib/content";

describe("SEO pages", () => {
  it("every feature page is unique and in the sitemap", () => {
    const slugs = FEATURE_PAGES.map((p) => p.slug);
    expect(new Set(slugs).size).toBe(slugs.length);
    const urls = sitemap().map((u) => u.url);
    for (const s of slugs) expect(urls).toContain(`https://salonkit.online/${s}/`);
    for (const p of FEATURE_PAGES) {
      expect(p.description.length).toBeLessThanOrEqual(170);
      expect(p.title.length).toBeLessThanOrEqual(70);
    }
  });
  it("FAQ structured data has every question", () => {
    expect(faqJsonLd(HOME_FAQS).mainEntity).toHaveLength(HOME_FAQS.length);
  });
});
