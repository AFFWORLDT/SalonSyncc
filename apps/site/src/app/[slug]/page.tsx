import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowRight, CheckCircle2 } from "lucide-react";
import { SiteNav } from "@/components/nav";
import { SiteFooter } from "@/components/site-footer";
import { FaqList } from "@/components/faq";
import { FeatureIcon } from "@/components/feature-icon";
import { FEATURE_PAGES, featurePage } from "@/lib/content";
import { pageOpenGraph, SITE_URL } from "@/lib/seo";

export const dynamicParams = false;
export const generateStaticParams = () => FEATURE_PAGES.map((p) => ({ slug: p.slug }));

type Props = { params: Promise<{ slug: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const p = featurePage((await params).slug);
  if (!p) return {};
  const path = `/${p.slug}/`;
  return { title: p.title, description: p.description, alternates: { canonical: path }, openGraph: pageOpenGraph(path, p.title, p.description) };
}

/** One feature page: what it does, which plan has it, questions, and links to the other features. */
export default async function FeatureLanding({ params }: Props) {
  const p = featurePage((await params).slug);
  if (!p) notFound();
  const others = FEATURE_PAGES.filter((o) => o.slug !== p.slug);
  const breadcrumbs = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      { "@type": "ListItem", position: 1, name: "SalonKit", item: `${SITE_URL}/` },
      { "@type": "ListItem", position: 2, name: p.label, item: `${SITE_URL}/${p.slug}/` },
    ],
  };
  return (
    <main className="relative overflow-hidden">
      <div aria-hidden className="pointer-events-none absolute -left-40 top-20 size-[520px] rounded-full bg-[#2a9d88]/20 blur-3xl" />
      <div aria-hidden className="pointer-events-none absolute -right-40 top-[40rem] size-[520px] rounded-full bg-[#b8935a]/20 blur-3xl" />
      <SiteNav dark={false} />
      <article className="relative px-6 pt-32 pb-16 sm:px-12">
        <div className="mx-auto max-w-3xl">
          <nav aria-label="Breadcrumb" className="text-sm text-muted-foreground">
            <Link href="/" className="hover:text-foreground">SalonKit</Link> <span aria-hidden>›</span> <span>{p.label}</span>
          </nav>
          <div className="mt-8 flex items-center gap-4">
            <FeatureIcon icon={p.icon} size={64} />
            <div>
              <p className="text-sm font-semibold tracking-wide text-primary uppercase">{p.eyebrow}</p>
              <p className="mt-1 text-sm text-muted-foreground">{p.plan}</p>
            </div>
          </div>
          <h1 className="mt-6 text-balance text-4xl font-semibold tracking-tight sm:text-6xl">{p.h1}</h1>
          <p className="mt-6 text-xl leading-relaxed text-muted-foreground">{p.lead}</p>
          <div className="mt-8 flex flex-wrap gap-3">
            <Link href="/signup/" className="inline-flex h-12 items-center rounded-full bg-primary px-6 font-semibold text-primary-foreground shadow-[0_10px_25px_rgba(31,122,106,0.3)] hover:brightness-110">
              Start your 7-day free trial
            </Link>
            <Link href="/pricing/" className="inline-flex h-12 items-center rounded-full border border-foreground/15 bg-background/70 px-6 font-semibold hover:bg-background">
              See pricing
            </Link>
          </div>

          <div className="mt-16 grid gap-6">
            {p.sections.map((s) => (
              <section key={s.h2} className="glass rounded-3xl p-7 shadow-sm sm:p-9">
                <h2 className="text-2xl font-semibold tracking-tight">{s.h2}</h2>
                <p className="mt-3 text-[16px] leading-relaxed text-muted-foreground">{s.body}</p>
                {s.bullets && (
                  <ul className="mt-5 grid gap-2.5 sm:grid-cols-2">
                    {s.bullets.map((b) => (
                      <li key={b} className="flex items-start gap-2.5 text-[15px]">
                        <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden />
                        {b}
                      </li>
                    ))}
                  </ul>
                )}
              </section>
            ))}
          </div>

          <section className="mt-20">
            <h2 className="text-3xl font-semibold tracking-tight">Questions</h2>
            <FaqList faqs={p.faqs} className="mt-6" />
          </section>

          <section className="mt-20">
            <h2 className="text-3xl font-semibold tracking-tight">More of what SalonKit does</h2>
            <ul className="mt-6 grid gap-3 sm:grid-cols-2">
              {others.map((o) => (
                <li key={o.slug}>
                  <Link href={`/${o.slug}/`} className="glass group flex items-center gap-4 rounded-2xl p-4 transition hover:-translate-y-0.5 hover:shadow-md">
                    <FeatureIcon icon={o.icon} size={44} />
                    <span className="flex-1 font-semibold">{o.label}</span>
                    <ArrowRight className="size-4 text-primary transition-transform group-hover:translate-x-0.5" aria-hidden />
                  </Link>
                </li>
              ))}
            </ul>
          </section>

          <section className="mt-20 rounded-3xl bg-gradient-to-br from-[#0f2e29] to-[#1f7a6a] p-10 text-center text-white shadow-[0_30px_60px_-20px_rgba(15,46,41,0.6)]">
            <h2 className="text-3xl font-semibold tracking-tight">Try SalonKit free for 7 days</h2>
            <p className="mx-auto mt-3 max-w-md text-white/80">Every feature of Pro Max, no card needed. Your salon gets its own web address in a few minutes.</p>
            <Link href="/signup/" className="mt-7 inline-flex h-12 items-center rounded-full bg-white px-7 font-semibold text-[#0f2e29] hover:bg-white/90">
              Start free trial
            </Link>
          </section>
        </div>
      </article>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbs).replace(/</g, "\\u003c") }} />
      <SiteFooter />
    </main>
  );
}
