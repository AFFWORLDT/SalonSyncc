/* eslint-disable @next/next/no-img-element -- static export: plain <img> with explicit sizes */
import Link from "next/link";
import { ArrowRight, Check } from "lucide-react";
import { Reveal } from "./reveal";
import { BrowserFrame, Phone } from "./frames";
import type { HomeCopy, Story } from "./copy";

const story = (t: HomeCopy, key: Story["key"]) => t.stories.find((s) => s.key === key)!;

function MoreLink({ href, label, light }: { href: string; label: string; light?: boolean }) {
  return (
    <Link href={href} className={`group inline-flex items-center gap-1.5 text-[15px] font-semibold underline-offset-4 hover:underline ${light ? "text-[#f0d3a8]" : "text-[#211a17]"}`}>
      {label}
      <ArrowRight className="size-4 transition-transform group-hover:translate-x-0.5 rtl:rotate-180 rtl:group-hover:-translate-x-0.5" aria-hidden />
    </Link>
  );
}

function Points({ items, light }: { items: string[]; light?: boolean }) {
  if (!items.length) return null;
  return (
    <ul className="mt-6 grid gap-2.5">
      {items.map((p) => (
        <li key={p} className="flex items-start gap-3 text-[16px]">
          <Check className={`mt-1 size-4 shrink-0 ${light ? "text-[#d9ad78]" : "text-[#946226]"}`} strokeWidth={2.4} aria-hidden />
          {p}
        </li>
      ))}
    </ul>
  );
}

const Eyebrow = ({ children, light }: { children: React.ReactNode; light?: boolean }) => (
  <p className={`text-[13px] font-semibold tracking-[0.16em] uppercase ${light ? "text-[#d9ad78]" : "text-[#946226]"}`}>{children}</p>
);
const H2 = ({ children, className = "" }: { children: React.ReactNode; className?: string }) => (
  <h2 className={`text-[2.15rem] leading-[1.08] font-extrabold tracking-[-0.04em] text-balance sm:text-5xl ${className}`}>{children}</h2>
);

/** Two editorial splits with real web screens: the dashboard, then the daily sheet. */
export function ProductSplits({ t }: { t: HomeCopy }) {
  const s = t.showcase;
  const r = story(t, "reports");
  return (
    <section id="showcase" className="scroll-mt-24 px-5 py-24 sm:px-8 sm:py-32">
      <div className="mx-auto grid max-w-7xl gap-24 sm:gap-32">
        <div className="grid items-center gap-12 lg:grid-cols-12 lg:gap-16">
          <Reveal className="lg:col-span-7">
            <BrowserFrame name="web-dashboard" alt={s.laptopAlt} />
          </Reveal>
          <Reveal delay={100} className="lg:col-span-5">
            <Eyebrow>{s.eyebrow}</Eyebrow>
            <H2 className="mt-4">{s.title}</H2>
            <p className="mt-5 text-[17px] leading-relaxed text-muted-foreground">{s.lead}</p>
            <Points items={s.points} />
          </Reveal>
        </div>
        <div id="features" className="grid scroll-mt-24 items-center gap-12 lg:grid-cols-12 lg:gap-16">
          <Reveal className="lg:order-2 lg:col-span-7">
            <BrowserFrame name="web-sheet" alt={s.sheetAlt} />
          </Reveal>
          <Reveal delay={100} className="lg:order-1 lg:col-span-5">
            <Eyebrow>{r.eyebrow}</Eyebrow>
            <H2 className="mt-4">{r.title}</H2>
            <p className="mt-5 text-[17px] leading-relaxed text-muted-foreground">{r.lead}</p>
            <Points items={r.points} />
            <p className="mt-7 text-sm text-muted-foreground">{r.plan}</p>
            <div className="mt-3">
              <MoreLink href={r.href} label={r.more} />
            </div>
          </Reveal>
        </div>
      </div>
    </section>
  );
}

/** Full-width espresso: billing, VAT invoices and staff commission, each with a real screen. */
export function Counter({ t }: { t: HomeCopy }) {
  const c = t.counter;
  const blocks = (["billing", "uae", "commission"] as const).map((k) => story(t, k));
  return (
    <section className="bg-[#211a17] px-5 py-24 text-[#f7f1e8] sm:px-8 sm:py-32">
      <div className="mx-auto max-w-7xl">
        <Reveal className="max-w-3xl">
          <Eyebrow light>{c.eyebrow}</Eyebrow>
          <H2 className="mt-4">{c.title}</H2>
          <p className="mt-5 max-w-2xl text-[17px] leading-relaxed text-[#f7f1e8]/70">{c.lead}</p>
        </Reveal>

        <div className="mt-16 grid items-start gap-14 lg:grid-cols-12 lg:gap-16">
          <Reveal className="grid grid-cols-2 gap-4 sm:gap-6 lg:col-span-5">
            <Phone src="/img/screens/phone-new-sale.webp" alt={c.saleAlt} />
            <Phone src="/img/screens/phone-bill.webp" alt={c.invoiceAlt} className="mt-12" />
          </Reveal>
          <div className="grid gap-10 lg:col-span-7">
            {blocks.slice(0, 2).map((b, i) => (
              <Reveal key={b.key} delay={i * 80} className="border-t border-white/12 pt-8">
                <h3 className="text-2xl font-bold tracking-[-0.02em]">{b.title}</h3>
                <p className="mt-3 text-[16px] leading-relaxed text-[#f7f1e8]/70">{b.lead}</p>
                <Points items={b.points} light />
                <div className="mt-5 flex flex-wrap items-center gap-x-5 gap-y-2">
                  <span className="text-sm text-[#f7f1e8]/50">{b.plan}</span>
                  <MoreLink href={b.href} label={b.more} light />
                </div>
              </Reveal>
            ))}
          </div>
        </div>

        <div className="mt-24 grid items-center gap-12 border-t border-white/12 pt-16 lg:grid-cols-12 lg:gap-16">
          <Reveal className="lg:col-span-5">
            <Eyebrow light>{blocks[2]!.eyebrow}</Eyebrow>
            <h3 className="mt-4 text-3xl leading-tight font-extrabold tracking-[-0.03em] sm:text-4xl">{blocks[2]!.title}</h3>
            <p className="mt-4 text-[16px] leading-relaxed text-[#f7f1e8]/70">{blocks[2]!.lead}</p>
            <Points items={blocks[2]!.points} light />
            <div className="mt-6 flex flex-wrap items-center gap-x-5 gap-y-2">
              <span className="text-sm text-[#f7f1e8]/50">{blocks[2]!.plan}</span>
              <MoreLink href={blocks[2]!.href} label={blocks[2]!.more} light />
            </div>
          </Reveal>
          <Reveal delay={100} className="lg:col-span-7">
            <BrowserFrame name="web-monthly" alt={c.monthlyAlt} dark />
          </Reveal>
        </div>
      </div>
    </section>
  );
}

/** Photography-led: a barber at work beside WhatsApp follow-ups and reviews, with the real ratings screen. */
export function Retention({ t }: { t: HomeCopy }) {
  const c = t.retention;
  const wa = story(t, "whatsapp");
  const rv = story(t, "reviews");
  return (
    <section className="bg-[#f0e5d8]">
      <div className="mx-auto grid max-w-7xl items-center gap-12 px-5 py-20 sm:px-8 sm:py-28 lg:grid-cols-12 lg:gap-16">
        <div className="overflow-hidden rounded-[4px] lg:col-span-6">
          <img src="/img/photo/barber-at-work.webp" alt={c.photoAlt} width={900} height={542} loading="lazy" decoding="async" className="sk-photo aspect-[5/3.4] h-auto w-full object-cover object-[30%_center]" />
        </div>
        <div className="lg:col-span-6">
          <Reveal>
            <Eyebrow>{c.eyebrow}</Eyebrow>
            <H2 className="mt-4">{c.title}</H2>
            <p className="mt-5 text-[17px] leading-relaxed text-muted-foreground">{c.lead}</p>
          </Reveal>
          <div className="mt-10 grid items-start gap-8 sm:grid-cols-[1fr_auto]">
            <div className="grid gap-8">
              {[wa, rv].map((b, i) => (
                <Reveal key={b.key} delay={i * 80} className="border-t border-[rgb(72_52_35/0.14)] pt-6">
                  <h3 className="text-xl font-bold tracking-[-0.02em]">{b.title}</h3>
                  <p className="mt-2 text-[15px] leading-relaxed text-muted-foreground">{b.lead}</p>
                  <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-2">
                    <span className="text-[13px] text-muted-foreground">{b.plan}</span>
                    <MoreLink href={b.href} label={b.more} />
                  </div>
                </Reveal>
              ))}
            </div>
            <Reveal delay={150} className="mx-auto w-[200px] sm:w-[190px]">
              <Phone src="/img/screens/phone-ratings.webp" alt={c.ratingsAlt} />
            </Reveal>
          </div>
        </div>
      </div>
    </section>
  );
}
