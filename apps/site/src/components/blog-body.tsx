import Link from "next/link";
import { ArrowRight, Lightbulb } from "lucide-react";
import type { Block } from "@/lib/blog";

/** Renders a post's content blocks with the site's type scale. */
export function BlogBody({ blocks }: { blocks: Block[] }) {
  return (
    <div className="text-[17px] leading-[1.75] text-foreground/85">
      {blocks.map((b, i) => {
        if ("h2" in b) return <h2 key={i} className="mt-12 mb-4 text-2xl font-semibold tracking-tight text-foreground sm:text-3xl">{b.h2}</h2>;
        if ("h3" in b) return <h3 key={i} className="mt-8 mb-2 text-xl font-semibold text-foreground">{b.h3}</h3>;
        if ("p" in b) return <p key={i} className="my-4">{b.p}</p>;
        if ("ul" in b)
          return (
            <ul key={i} className="my-4 list-disc space-y-2 ps-6 marker:text-primary">
              {b.ul.map((x) => <li key={x}>{x}</li>)}
            </ul>
          );
        if ("ol" in b)
          return (
            <ol key={i} className="my-4 list-decimal space-y-2 ps-6 marker:font-semibold marker:text-primary">
              {b.ol.map((x) => <li key={x}>{x}</li>)}
            </ol>
          );
        if ("table" in b)
          return (
            <figure key={i} className="glass my-6 overflow-x-auto rounded-2xl p-1">
              <table className="w-full border-collapse text-[15px]">
                {b.table.caption && <caption className="px-4 pt-3 pb-1 text-start text-sm font-medium text-muted-foreground">{b.table.caption}</caption>}
                <thead>
                  <tr>{b.table.head.map((h) => <th key={h} className="border-b border-border px-4 py-2.5 text-start font-semibold">{h}</th>)}</tr>
                </thead>
                <tbody>
                  {b.table.rows.map((r, ri) => (
                    <tr key={ri} className={b.table.total && ri === b.table.rows.length - 1 ? "font-semibold" : ""}>
                      {r.map((c, ci) => <td key={ci} className="border-b border-border/60 px-4 py-2.5 last:border-b-0">{c}</td>)}
                    </tr>
                  ))}
                </tbody>
              </table>
            </figure>
          );
        if ("tip" in b)
          return (
            <aside key={i} className="my-6 flex gap-3 rounded-2xl border border-primary/25 bg-primary/5 p-5 text-[16px]">
              <Lightbulb className="mt-1 size-5 shrink-0 text-primary" aria-hidden />
              <p>{b.tip}</p>
            </aside>
          );
        return (
          <aside key={i} className="my-8 flex flex-wrap items-center justify-between gap-4 rounded-2xl bg-gradient-to-br from-[#211a17] to-[#946226] p-6 text-white">
            <p className="text-[16px]">{b.cta.text}</p>
            <Link href={b.cta.href} className="inline-flex items-center gap-1.5 rounded-full bg-white px-5 py-2.5 text-sm font-semibold text-[#211a17] hover:bg-white/90">
              {b.cta.label} <ArrowRight className="size-4" aria-hidden />
            </Link>
          </aside>
        );
      })}
    </div>
  );
}

export const formatDate = (iso: string) => new Date(`${iso}T12:00:00Z`).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric", timeZone: "Asia/Dubai" });
