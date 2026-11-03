import type { MetadataRoute } from "next";
import { SITE_URL } from "@/lib/seo";
import { FEATURE_PAGES } from "@/lib/content";

export const dynamic = "force-static";

/** sitemap.xml: every public page (trailing slashes, as the static export serves them). */
export default function sitemap(): MetadataRoute.Sitemap {
  const now = new Date();
  return [
    { url: `${SITE_URL}/`, lastModified: now, changeFrequency: "weekly", priority: 1 },
    { url: `${SITE_URL}/pricing/`, lastModified: now, changeFrequency: "monthly", priority: 0.8 },
    { url: `${SITE_URL}/signup/`, lastModified: now, changeFrequency: "monthly", priority: 0.6 },
    ...FEATURE_PAGES.map((p) => ({ url: `${SITE_URL}/${p.slug}/`, lastModified: now, changeFrequency: "monthly" as const, priority: 0.7 })),
  ];
}
