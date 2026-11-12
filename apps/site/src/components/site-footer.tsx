/* eslint-disable @next/next/no-img-element -- static export */
import Link from "next/link";
import { Mail, MapPin } from "lucide-react";
import { BRAND_NAME, COMPANY, OFFICE, OFFICE_MAPS_URL, SOCIAL_LINKS, SUPPORT_EMAIL } from "@/lib/brand";
import { NewsletterForm } from "@/components/home/newsletter-form";
import { HOME_EN, type HomeCopy, type Link as FLink } from "@/components/home/copy";

function Column({ title, links }: { title: string; links: FLink[] }) {
  return (
    <div>
      <h2 className="text-sm font-semibold tracking-[0.12em] text-[#d9ad78] uppercase">{title}</h2>
      <ul className="mt-4 grid gap-2.5">
        {links.map((l) => (
          <li key={l.href + l.label}>
            <Link href={l.href} className="text-[15px] text-[#f7f1e8]/70 transition-colors hover:text-[#f7f1e8]">
              {l.label}
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** The site footer: brand, links, the Dubai office and legal links, on deep espresso with a salon still life. */
export function SiteFooter({ t = HOME_EN }: { t?: HomeCopy }) {
  const f = t.footer;
  return (
    <footer className="relative overflow-hidden bg-[#211a17] text-[#f7f1e8]">
      <div aria-hidden className="pointer-events-none absolute -top-40 size-[560px] rounded-full bg-[#c58a45]/15 blur-3xl ltr:-right-40 rtl:-left-40" />
      <div className="relative mx-auto max-w-7xl px-5 pt-20 pb-10 sm:px-8">
        <div className="grid gap-12 lg:grid-cols-[1.3fr_2fr]">
          <div className="max-w-sm">
            <Link href={t.home} className="flex items-center gap-2.5 text-xl font-bold font-display">
              <img src="/brand/mark.png" alt="" width={40} height={40} loading="lazy" className="size-10 rounded-full bg-black ring-1 ring-[#d9ad78]/40" />
              {BRAND_NAME}
            </Link>
            <p className="mt-5 text-[15px] leading-relaxed text-[#f7f1e8]/65">{f.blurb}</p>
            <div className="mt-8">
              <NewsletterForm t={{ title: t.newsletter.title, lead: t.newsletter.lead, placeholder: t.newsletter.placeholder, button: t.newsletter.button, sending: t.newsletter.sending, done: t.newsletter.done, error: t.newsletter.error, privacy: t.newsletter.privacy }} lang={t.lang} />
            </div>
            {SOCIAL_LINKS.length > 0 && (
              <div className="mt-8">
                <p className="text-sm font-semibold tracking-[0.12em] text-[#d9ad78] uppercase">{f.follow}</p>
                <ul className="mt-3 flex flex-wrap gap-2">
                  {SOCIAL_LINKS.map((l) => (
                    <li key={l.url}>
                      <a href={l.url} target="_blank" rel="me noopener" className="inline-flex rounded-full border border-white/15 px-3.5 py-1.5 text-sm text-[#f7f1e8]/80 capitalize hover:border-[#d9ad78] hover:text-[#f7f1e8]">
                        {l.network === "x" ? "X" : l.network === "linkedin" ? "LinkedIn" : l.network === "youtube" ? "YouTube" : l.network === "tiktok" ? "TikTok" : l.network}
                      </a>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
          <div className="grid grid-cols-2 gap-10 sm:grid-cols-4">
            <Column title={f.product} links={f.productLinks} />
            <Column title={f.features} links={f.featureLinks} />
            <Column title={f.resources} links={f.resourceLinks} />
            <div>
              <h2 className="text-sm font-semibold tracking-[0.12em] text-[#d9ad78] uppercase">{f.company}</h2>
              <address className="mt-4 grid gap-3 text-[15px] not-italic text-[#f7f1e8]/70">
                <span lang="en">{COMPANY}</span>
                <a href={OFFICE_MAPS_URL} target="_blank" rel="noopener" className="flex items-start gap-2 hover:text-[#f7f1e8]">
                  <MapPin className="mt-0.5 size-4 shrink-0 text-[#d9ad78]" aria-hidden />
                  <span lang="en">
                    {OFFICE.street}, {OFFICE.area}, {OFFICE.locality}, UAE
                  </span>
                </a>
                {SUPPORT_EMAIL && (
                  <a href={`mailto:${SUPPORT_EMAIL}`} className="flex items-center gap-2 hover:text-[#f7f1e8]">
                    <Mail className="size-4 shrink-0 text-[#d9ad78]" aria-hidden />
                    {f.email}
                  </a>
                )}
              </address>
            </div>
          </div>
        </div>
        <div className="mt-16 flex flex-wrap items-center justify-between gap-4 border-t border-white/10 pt-8 text-sm text-[#f7f1e8]/55">
          <p>
            © {new Date().getFullYear()} <span lang="en">{COMPANY}</span>. {f.rights}
          </p>
          <nav aria-label="Legal" className="flex flex-wrap gap-x-6 gap-y-2">
            {f.legal.map((l) => (
              <Link key={l.href} href={l.href} className="hover:text-[#f7f1e8]">
                {l.label}
              </Link>
            ))}
          </nav>
        </div>
      </div>
    </footer>
  );
}
