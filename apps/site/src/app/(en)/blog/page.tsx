import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { SiteNav } from "@/components/nav";
import { SiteFooter } from "@/components/site-footer";
import { formatDate } from "@/components/blog-body";
import { postsByDate } from "@/lib/blog";
import { pageOpenGraph } from "@/lib/seo";

const TITLE = "Salon business guides for the UAE";
const DESC = "Practical guides for salon and barber shop owners in Dubai and the UAE: commission, VAT, WhatsApp, cash-up and running the front desk.";

export const metadata: Metadata = { title: TITLE, description: DESC, alternates: { canonical: "/blog/" }, openGraph: pageOpenGraph("/blog/", TITLE, DESC) };

export default function BlogIndex() {
  const posts = postsByDate();
  return (
    <main className="relative overflow-hidden">
      <div aria-hidden className="pointer-events-none absolute -left-40 top-20 size-[520px] rounded-full bg-[#2a9d88]/20 blur-3xl" />
      <SiteNav dark={false} />
      <section className="relative px-6 pt-32 pb-24 sm:px-12">
        <div className="mx-auto max-w-4xl">
          <p className="text-sm font-semibold tracking-wide text-primary uppercase">Blog</p>
          <h1 className="mt-3 text-balance text-4xl font-semibold tracking-tight sm:text-6xl">{TITLE}</h1>
          <p className="mt-5 max-w-2xl text-xl leading-relaxed text-muted-foreground">{DESC}</p>
          <ul className="mt-14 grid gap-5 sm:grid-cols-2">
            {posts.map((p) => (
              <li key={p.slug}>
                <Link href={`/blog/${p.slug}/`} className="glass group flex h-full flex-col rounded-3xl p-7 shadow-sm transition hover:-translate-y-1 hover:shadow-xl">
                  <p className="text-xs font-semibold tracking-wide text-primary uppercase">{p.tag}</p>
                  <h2 className="mt-3 text-xl font-semibold leading-snug tracking-tight">{p.title}</h2>
                  <p className="mt-3 flex-1 text-[15px] leading-relaxed text-muted-foreground">{p.description}</p>
                  <p className="mt-6 flex items-center justify-between text-sm text-muted-foreground">
                    <span>
                      <time dateTime={p.date}>{formatDate(p.date)}</time> · {p.minutes} min read
                    </span>
                    <ArrowRight className="size-4 text-primary transition-transform group-hover:translate-x-0.5" aria-hidden />
                  </p>
                </Link>
              </li>
            ))}
          </ul>
        </div>
      </section>
      <SiteFooter />
    </main>
  );
}
