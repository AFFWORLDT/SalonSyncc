"use client";

import { useEffect, useRef, useState } from "react";
import { Play, X } from "lucide-react";
import type { HomeCopy } from "./copy";

/** "Watch demo": a play button that opens the 60-second SalonKit video in a dialog (the video loads only when opened). */
export function DemoButton({ label, t, className }: { label: string; t: HomeCopy["demo"]; className?: string }) {
  const [open, setOpen] = useState(false);
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const d = dialog.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
  }, [open]);
  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className={className}>
        <span className="grid size-11 place-items-center rounded-full bg-white shadow-[0_8px_20px_-6px_rgb(33_26_23/0.35)] transition-transform group-hover:scale-105">
          <Play className="size-4 translate-x-px fill-current" aria-hidden />
        </span>
        {label}
      </button>
      <dialog
        ref={dialog}
        onClose={() => setOpen(false)}
        onClick={(e) => e.target === e.currentTarget && setOpen(false)}
        className="m-auto w-[min(92vw,1100px)] overflow-visible rounded-3xl bg-transparent p-0 backdrop:bg-[#211a17]/75 backdrop:backdrop-blur-sm"
        aria-label={t.title}
      >
        {open && (
          <div className="relative overflow-hidden rounded-3xl bg-black shadow-2xl">
            <video className="aspect-video w-full" src="/media/salonkit-demo.mp4" poster="/media/salonkit-demo-poster.jpg" controls autoPlay playsInline preload="metadata">
              {t.unsupported}
            </video>
            <button type="button" onClick={() => setOpen(false)} aria-label={t.close} className="absolute top-3 grid size-10 place-items-center rounded-full bg-black/60 text-white ltr:right-3 rtl:left-3">
              <X className="size-5" aria-hidden />
            </button>
          </div>
        )}
      </dialog>
    </>
  );
}
