import { ChevronDown } from "lucide-react";
import { faqJsonLd, type Faq } from "@/lib/content";
import { cn } from "@/lib/utils";

/** Questions and answers as plain <details> (all text is in the HTML for search engines), with FAQPage structured data. */
export function FaqList({ faqs, className }: { faqs: Faq[]; className?: string }) {
  return (
    <div className={cn("grid gap-3", className)}>
      {faqs.map((f) => (
        <details key={f.q} className="glass group rounded-2xl px-6 py-4 shadow-sm open:shadow-md">
          <summary className="flex cursor-pointer list-none items-center justify-between gap-4 text-left text-[17px] font-semibold [&::-webkit-details-marker]:hidden">
            {f.q}
            <ChevronDown className="size-5 shrink-0 text-primary transition-transform group-open:rotate-180" aria-hidden />
          </summary>
          <p className="mt-3 text-[15px] leading-relaxed text-muted-foreground">{f.a}</p>
        </details>
      ))}
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(faqJsonLd(faqs)).replace(/</g, "\\u003c") }} />
    </div>
  );
}

/** The home page FAQ section. */
export function FaqSection({ faqs, title = "Questions salon owners ask" }: { faqs: Faq[]; title?: string }) {
  return (
    <section id="faq" className="px-6 py-24 sm:px-12">
      <div className="mx-auto max-w-3xl">
        <h2 className="text-balance text-4xl font-semibold tracking-tight sm:text-5xl">{title}</h2>
        <p className="mt-4 text-lg text-muted-foreground">Straight answers about SalonKit for salons and barber shops in the UAE.</p>
        <FaqList faqs={faqs} className="mt-10" />
      </div>
    </section>
  );
}
