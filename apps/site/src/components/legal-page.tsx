import { SiteNav } from "@/components/nav";
import { SiteFooter } from "@/components/site-footer";

/** Contact for privacy and terms questions (also on the pages themselves). */
export const LEGAL_EMAIL = "support@salonkit.online";
export const LEGAL_UPDATED = "9 November 2026";

export type LegalSection = { title: string; body: (string | string[])[] };

/** Privacy Policy and Terms: plain headings and paragraphs (a string[] is a bullet list). */
export function LegalPage({ title, intro, sections }: { title: string; intro: string; sections: LegalSection[] }) {
  return (
    <main>
      <SiteNav dark={false} />
      <article className="mx-auto max-w-3xl px-5 pb-20 pt-28 sm:px-8">
        <h1 className="text-balance text-4xl font-semibold tracking-tight">{title}</h1>
        <p className="mt-3 text-sm text-muted-foreground">Last updated {LEGAL_UPDATED}</p>
        <p className="mt-6 text-[17px] leading-relaxed">{intro}</p>
        {sections.map((s) => (
          <section key={s.title} className="mt-10">
            <h2 className="text-xl font-semibold">{s.title}</h2>
            {s.body.map((b, i) =>
              Array.isArray(b) ? (
                <ul key={i} className="mt-3 list-disc space-y-1.5 ps-6 leading-relaxed">
                  {b.map((li) => (
                    <li key={li}>{li}</li>
                  ))}
                </ul>
              ) : (
                <p key={i} className="mt-3 leading-relaxed">
                  {b}
                </p>
              ),
            )}
          </section>
        ))}
      </article>
      <SiteFooter />
    </main>
  );
}
