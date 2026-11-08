import type { MetadataRoute } from "next";
import { SITE_URL } from "@/lib/seo";
import { FEATURE_PAGES } from "@/lib/content";
import { POSTS } from "@/lib/blog";

export const dynamic = "force-static";

/** sitemap.xml: every public page (trailing slashes, as the static export serves them). */
const LANGS = { "en-AE": `${SITE_URL}/`, "ar-AE": `${SITE_URL}/ar/` };

export default function sitemap(): MetadataRoute.Sitemap {
  const now = new Date();
  return [
    { url: `${SITE_URL}/`, lastModified: now, changeFrequency: "weekly", priority: 1, alternates: { languages: LANGS } },
    { url: `${SITE_URL}/ar/`, lastModified: now, changeFrequency: "weekly", priority: 0.9, alternates: { languages: LANGS } },
    { url: `${SITE_URL}/pricing/`, lastModified: now, changeFrequency: "monthly", priority: 0.8 },
    { url: `${SITE_URL}/signup/`, lastModified: now, changeFrequency: "monthly", priority: 0.6 },
    { url: `${SITE_URL}/privacy/`, lastModified: now, changeFrequency: "yearly", priority: 0.2 },
    { url: `${SITE_URL}/terms/`, lastModified: now, changeFrequency: "yearly", priority: 0.2 },
    ...FEATURE_PAGES.map((p) => ({ url: `${SITE_URL}/${p.slug}/`, lastModified: now, changeFrequency: "monthly" as const, priority: 0.7 })),
    { url: `${SITE_URL}/blog/`, lastModified: now, changeFrequency: "weekly", priority: 0.7 },
    ...POSTS.map((p) => ({ url: `${SITE_URL}/blog/${p.slug}/`, lastModified: new Date(p.updated ?? p.date), changeFrequency: "yearly" as const, priority: 0.6 })),
  ];
}
