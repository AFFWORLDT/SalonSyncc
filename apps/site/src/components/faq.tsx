import { Plus } from "lucide-react";
import { faqJsonLd, type Faq } from "@/lib/content";
import { cn } from "@/lib/utils";
import { Reveal } from "@/components/home/reveal";

/** Questions and answers as plain <details> (all text is in the HTML for search engines), with FAQPage structured data. */
export function FaqList({ faqs, className, lang = "en" }: { faqs: Faq[]; className?: string; lang?: string }) {
  return (
    <div className={cn("grid gap-3", className)}>
      {faqs.map((f) => (
        <details key={f.q} className="group rounded-3xl border border-[rgb(72_52_35/0.12)] bg-[#fffaf3] px-6 py-5 transition-shadow open:bg-white open:shadow-[var(--shadow-soft)]">
          <summary className="flex cursor-pointer list-none items-center justify-between gap-4 text-start text-[17px] font-semibold font-display [&::-webkit-details-marker]:hidden">
            {f.q}
            <span className="grid size-8 shrink-0 place-items-center rounded-full bg-[#f5e5d2] text-[#8a5a22] transition-transform duration-300 group-open:rotate-45">
              <Plus className="size-4" aria-hidden />
            </span>
          </summary>
          <p className="mt-3 pe-10 text-[15px] leading-relaxed text-muted-foreground">{f.a}</p>
        </details>
      ))}
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(faqJsonLd(faqs, lang)).replace(/</g, "\\u003c") }} />
    </div>
  );
}

/** The home page FAQ section. */
export function FaqSection({
  faqs,
  title = "Questions salon owners ask",
  lead = "Straight answers about SalonKit for salons and barber shops in the UAE.",
  eyebrow = "FAQ",
  lang = "en",
}: {
  faqs: Faq[];
  title?: string;
  lead?: string;
  eyebrow?: string;
  lang?: string;
}) {
  return (
    <section id="faq" className="scroll-mt-24 px-5 py-24 sm:px-8 sm:py-32">
      <div className="mx-auto grid max-w-7xl gap-12 lg:grid-cols-[0.8fr_1.2fr]">
        <Reveal>
          <p className="sk-eyebrow">{eyebrow}</p>
          <h2 className="mt-5 text-4xl leading-[1.05] font-extrabold tracking-[-0.04em] text-balance sm:text-5xl">{title}</h2>
          <p className="mt-5 text-lg text-muted-foreground">{lead}</p>
        </Reveal>
        <Reveal delay={100}>
          <FaqList faqs={faqs} lang={lang} />
        </Reveal>
      </div>
    </section>
  );
}
