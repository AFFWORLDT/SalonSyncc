import type { MetadataRoute } from "next";
import { SITE_URL } from "@/lib/seo";
import { FEATURE_PAGES } from "@/lib/content";
import { POSTS } from "@/lib/blog";

export const dynamic = "force-static";

/** sitemap.xml: every public page (trailing slashes, as the static export serves them). */
const LANGS = { "en-AE": `${SITE_URL}/`, "ar-AE": `${SITE_URL}/ar/`, "x-default": `${SITE_URL}/` };
/** When each page's content last really changed (bump only when the words change, so Google can trust lastmod). */
const UPDATED = { home: "2026-11-13", pricing: "2026-11-13", signup: "2026-11-12", legal: "2026-11-09", features: "2026-11-04", support: "2026-11-12" };
const d = (s: string) => new Date(`${s}T00:00:00Z`);

export default function sitemap(): MetadataRoute.Sitemap {
  const blogUpdated = POSTS.map((p) => p.updated ?? p.date).sort().at(-1) ?? UPDATED.home;
  return [
    { url: `${SITE_URL}/`, lastModified: d(UPDATED.home), changeFrequency: "weekly", priority: 1, alternates: { languages: LANGS } },
    { url: `${SITE_URL}/ar/`, lastModified: d(UPDATED.home), changeFrequency: "weekly", priority: 0.9, alternates: { languages: LANGS } },
    { url: `${SITE_URL}/pricing/`, lastModified: d(UPDATED.pricing), changeFrequency: "monthly", priority: 0.8 },
    { url: `${SITE_URL}/signup/`, lastModified: d(UPDATED.signup), changeFrequency: "monthly", priority: 0.6 },
    { url: `${SITE_URL}/privacy/`, lastModified: d(UPDATED.legal), changeFrequency: "yearly", priority: 0.2 },
    { url: `${SITE_URL}/support/`, lastModified: d(UPDATED.support), changeFrequency: "yearly", priority: 0.3 },
    { url: `${SITE_URL}/terms/`, lastModified: d(UPDATED.legal), changeFrequency: "yearly", priority: 0.2 },
    ...FEATURE_PAGES.map((p) => ({ url: `${SITE_URL}/${p.slug}/`, lastModified: d(UPDATED.features), changeFrequency: "monthly" as const, priority: 0.7 })),
    { url: `${SITE_URL}/blog/`, lastModified: d(blogUpdated), changeFrequency: "weekly", priority: 0.7 },
    ...POSTS.map((p) => ({ url: `${SITE_URL}/blog/${p.slug}/`, lastModified: new Date(p.updated ?? p.date), changeFrequency: "yearly" as const, priority: 0.6 })),
  ];
}
