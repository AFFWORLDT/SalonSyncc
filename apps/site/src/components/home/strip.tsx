import { IconTile } from "./icons";
import type { HomeCopy } from "./copy";

/** A slim row of what SalonKit does, between hairlines. */
export function Strip({ t }: { t: HomeCopy }) {
  return (
    <div className="border-y border-[rgb(72_52_35/0.12)] bg-[#f3ebe0]">
      <ul className="mx-auto grid max-w-7xl grid-cols-2 gap-x-6 gap-y-5 px-5 py-6 sm:grid-cols-3 sm:px-8 xl:grid-cols-6">
        {t.strip.map((s) => (
          <li key={s.title} className="flex items-center gap-3">
            <IconTile icon={s.icon} />
            <span className="min-w-0">
              <span className="block text-[14px] leading-tight font-semibold">{s.title}</span>
              <span className="mt-0.5 hidden text-[12.5px] leading-snug text-muted-foreground sm:block">{s.desc}</span>
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
