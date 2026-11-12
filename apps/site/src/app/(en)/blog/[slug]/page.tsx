import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { SiteNav } from "@/components/nav";
import { SiteFooter } from "@/components/site-footer";
import { BlogBody, formatDate } from "@/components/blog-body";
import { POSTS, postBySlug, postsByDate } from "@/lib/blog";
import { BRAND_NAME } from "@/lib/brand";
import { SITE_URL } from "@/lib/seo";

export const dynamicParams = false;
export const generateStaticParams = () => POSTS.map((p) => ({ slug: p.slug }));

type Props = { params: Promise<{ slug: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const p = postBySlug((await params).slug);
  if (!p) return {};
  const path = `/blog/${p.slug}/`;
  return {
    title: p.seoTitle ?? p.title,
    description: p.description,
    alternates: { canonical: path },
    openGraph: {
      type: "article",
      url: path,
      siteName: BRAND_NAME,
      title: p.seoTitle ?? p.title,
      description: p.description,
      locale: "en_AE",
      publishedTime: p.date,
      modifiedTime: p.updated ?? p.date,
      images: [{ url: "/og.jpg", width: 1200, height: 630, alt: p.title }],
    },
  };
}

export default async function BlogPost({ params }: Props) {
  const p = postBySlug((await params).slug);
  if (!p) notFound();
  const url = `${SITE_URL}/blog/${p.slug}/`;
  const more = postsByDate().filter((o) => o.slug !== p.slug).slice(0, 3);
  const ld = [
    {
      "@context": "https://schema.org",
      "@type": "BlogPosting",
      headline: p.title,
      description: p.description,
      datePublished: p.date,
      dateModified: p.updated ?? p.date,
      mainEntityOfPage: url,
      image: `${SITE_URL}/og.jpg`,
      inLanguage: "en",
      author: { "@type": "Organization", name: BRAND_NAME, url: SITE_URL },
      publisher: { "@type": "Organization", name: BRAND_NAME, logo: { "@type": "ImageObject", url: `${SITE_URL}/icon-512.png` } },
    },
    {
      "@context": "https://schema.org",
      "@type": "BreadcrumbList",
      itemListElement: [
        { "@type": "ListItem", position: 1, name: "SalonKit", item: `${SITE_URL}/` },
        { "@type": "ListItem", position: 2, name: "Blog", item: `${SITE_URL}/blog/` },
        { "@type": "ListItem", position: 3, name: p.title, item: url },
      ],
    },
  ];
  return (
    <main className="relative overflow-hidden">
      <div aria-hidden className="pointer-events-none absolute -right-40 top-20 size-[520px] rounded-full bg-[#b8935a]/15 blur-3xl" />
      <SiteNav dark={false} />
      <article className="relative px-6 pt-32 pb-16 sm:px-12">
        <div className="mx-auto max-w-2xl">
          <nav aria-label="Breadcrumb" className="text-sm text-muted-foreground">
            <Link href="/" className="hover:text-foreground">SalonKit</Link> <span aria-hidden>›</span>{" "}
            <Link href="/blog/" className="hover:text-foreground">Blog</Link>
          </nav>
          <p className="mt-8 text-xs font-semibold tracking-wide text-primary uppercase">{p.tag}</p>
          <h1 className="mt-3 text-balance text-4xl font-semibold leading-tight tracking-tight sm:text-5xl">{p.title}</h1>
          <p className="mt-5 text-sm text-muted-foreground">
            By the {BRAND_NAME} team · <time dateTime={p.date}>{formatDate(p.date)}</time> · {p.minutes} min read
          </p>
          <p className="mt-8 text-xl leading-relaxed text-foreground/80">{p.intro}</p>
          <BlogBody blocks={p.body} />
        </div>
        <section className="mx-auto mt-20 max-w-4xl">
          <h2 className="text-2xl font-semibold tracking-tight">More guides</h2>
          <ul className="mt-6 grid gap-4 sm:grid-cols-3">
            {more.map((o) => (
              <li key={o.slug}>
                <Link href={`/blog/${o.slug}/`} className="glass block h-full rounded-2xl p-5 transition hover:-translate-y-0.5 hover:shadow-md">
                  <p className="text-xs font-semibold tracking-wide text-primary uppercase">{o.tag}</p>
                  <p className="mt-2 font-semibold leading-snug">{o.title}</p>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      </article>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(ld).replace(/</g, "\\u003c") }} />
      <SiteFooter />
    </main>
  );
}
