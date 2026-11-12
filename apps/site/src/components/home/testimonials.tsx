/* eslint-disable @next/next/no-img-element -- static export */
import { Quote, Star } from "lucide-react";
import { TESTIMONIALS } from "@/lib/content";
import { Reveal } from "./reveal";
import type { HomeCopy } from "./copy";

/** Real customer quotes (src/lib/content.ts). Renders nothing until there is at least one. */
export function Testimonials({ t }: { t: HomeCopy }) {
  const items = TESTIMONIALS.filter((q) => (q.lang ?? "en") === t.lang || TESTIMONIALS.every((x) => (x.lang ?? "en") !== t.lang));
  if (!items.length) return null;
  return (
    <section className="px-5 py-24 sm:px-8 sm:py-28">
      <div className="mx-auto max-w-7xl">
        <Reveal className="max-w-2xl">
          <p className="sk-eyebrow">{t.testimonials.eyebrow}</p>
          <h2 className="mt-5 text-4xl leading-[1.05] font-extrabold tracking-[-0.04em] text-balance sm:text-5xl">{t.testimonials.title}</h2>
        </Reveal>
        <ul className="mt-12 grid gap-5 md:grid-cols-2 lg:grid-cols-3">
          {items.map((q, i) => (
            <Reveal as="li" key={q.name + q.salon} delay={i * 80} className="sk-card flex flex-col p-7">
              <Quote className="size-7 text-[#d9ad78]" aria-hidden />
              <blockquote className="mt-4 flex-1 text-[17px] leading-relaxed">“{q.quote}”</blockquote>
              <div className="mt-6 flex items-center gap-3">
                {q.photo ? (
                  <img src={q.photo} alt="" width={48} height={48} loading="lazy" className="size-12 rounded-full object-cover" />
                ) : (
                  <span className="grid size-12 place-items-center rounded-full bg-[#211a17] font-bold text-[#d9ad78]">{q.name.slice(0, 1)}</span>
                )}
                <span className="text-sm leading-tight">
                  <span className="block font-semibold">{q.name}</span>
                  <span className="text-muted-foreground">
                    {q.role}, {q.salon} · {q.city}
                  </span>
                </span>
                <span className="ms-auto flex text-[#e0a42b]" aria-hidden>
                  {[0, 1, 2, 3, 4].map((s) => (
                    <Star key={s} className="size-3.5 fill-current" />
                  ))}
                </span>
              </div>
            </Reveal>
          ))}
        </ul>
      </div>
    </section>
  );
}
