/* eslint-disable @next/next/no-img-element -- static export: plain <img> with explicit sizes */

/** A phone around a real SalonKit screenshot (600 × 1304 captures). */
export function Phone({ src, alt, className = "", priority }: { src: string; alt: string; className?: string; priority?: boolean }) {
  return (
    <div className={`rounded-[2.2rem] bg-[#16110f] p-[6px] shadow-[0_30px_60px_-28px_rgb(33_26_23/0.55)] ring-1 ring-black/50 ${className}`}>
      <img src={src} alt={alt} width={600} height={1304} loading={priority ? "eager" : "lazy"} decoding="async" className="block h-auto w-full rounded-[1.85rem]" />
    </div>
  );
}

/** A plain browser window around a real SalonKit web screenshot (1600 / 2400 wide captures). */
export function BrowserFrame({ name, alt, host = "luxe.salonkit.online", className = "", dark }: { name: string; alt: string; host?: string; className?: string; dark?: boolean }) {
  return (
    <figure className={`overflow-hidden rounded-xl border ${dark ? "border-white/10 bg-[#2b221e]" : "border-[rgb(72_52_35/0.14)] bg-[#efe7dc]"} shadow-[0_40px_80px_-40px_rgb(33_26_23/0.45)] ${className}`}>
      <div className="flex h-8 items-center gap-1.5 px-3.5" aria-hidden>
        <span className="size-2.5 rounded-full bg-[#e0796b]" />
        <span className="size-2.5 rounded-full bg-[#e6bb5a]" />
        <span className="size-2.5 rounded-full bg-[#7fb56f]" />
        <span className={`mx-auto rounded-md px-3 py-0.5 font-mono text-[11px] ${dark ? "bg-white/8 text-white/50" : "bg-white/70 text-[#6b645c]"}`}>{host}</span>
      </div>
      <img
        src={`/img/screens/${name}.webp`}
        srcSet={`/img/screens/${name}.webp 1600w, /img/screens/${name}-2x.webp 2400w`}
        sizes="(min-width: 1280px) 760px, 94vw"
        alt={alt}
        width={1600}
        height={1000}
        loading="lazy"
        decoding="async"
        className="block h-auto w-full"
      />
    </figure>
  );
}
