"use client";

import type React from "react";
import { useState, useSyncExternalStore } from "react";
import Link from "next/link";
import { Dialog } from "@base-ui/react/dialog";
import { Warp, type WarpProps } from "@paper-design/shaders-react";
import { ArrowRight, CheckCircle2, X } from "lucide-react";
import { cn } from "@/lib/utils";

export interface ShaderFeature {
  title: string;
  description: string;
  icon: React.ReactNode;
  /** false: the icon is already a full coloured tile (e.g. WhatsApp), so it is not put on a white one. */
  iconTile?: boolean;
  /** Warp colours, darkest first. */
  colors: string[];
  shape?: NonNullable<WarpProps["shape"]>;
  /** The "Learn more" window: a short lead and the points it explains. */
  details: {
    lead: string;
    points: { title: string; body: string }[];
    plan?: string;
    /** The full feature page, linked from the window. */
    href?: string;
  };
}

const motionQuery = "(prefers-reduced-motion: reduce)";
function useReducedMotion() {
  return useSyncExternalStore(
    (cb) => {
      const m = window.matchMedia(motionQuery);
      m.addEventListener("change", cb);
      return () => m.removeEventListener("change", cb);
    },
    () => window.matchMedia(motionQuery).matches,
    () => true,
  );
}

function Icon({ f, size = "md" }: { f: ShaderFeature; size?: "md" | "lg" }) {
  const box = size === "lg" ? "size-16" : "size-14";
  if (f.iconTile === false)
    return (
      <div
        className={cn(
          box,
          "shrink-0 overflow-hidden rounded-2xl shadow-lg shadow-black/25 [&_img]:size-full",
        )}
      >
        {f.icon}
      </div>
    );
  return (
    <div
      className={cn(
        box,
        "grid shrink-0 place-items-center rounded-2xl bg-white shadow-lg shadow-black/20 ring-1 ring-white/60",
        size === "lg"
          ? "[&_img]:size-10 [&_svg]:size-10"
          : "[&_img]:size-9 [&_svg]:size-8",
      )}
    >
      {f.icon}
    </div>
  );
}

function Shader({
  f,
  i,
  still,
  speed,
}: {
  f: ShaderFeature;
  i: number;
  still: boolean;
  speed: number;
}) {
  return (
    <Warp
      className="absolute inset-0"
      style={{ height: "100%", width: "100%" }}
      colors={f.colors}
      proportion={0.35 + (i % 3) * 0.05}
      softness={1}
      distortion={0.2}
      swirl={0.85}
      swirlIterations={10}
      shape={f.shape ?? (i % 2 ? "stripes" : "checks")}
      shapeScale={0.1}
      speed={still ? 0 : speed}
      maxPixelCount={520 * 380}
    />
  );
}

/** Feature cards over moving Warp shaders (adapted from the shader feature-cards block), each with a "Learn more" window. */
export function FeatureShaderCards({
  features,
  className,
}: {
  features: ShaderFeature[];
  className?: string;
}) {
  const still = useReducedMotion();
  const [open, setOpen] = useState<number | null>(null);
  const f = open === null ? null : features[open];
  return (
    <>
      <div
        className={cn(
          "grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3",
          className,
        )}
      >
        {features.map((feat, i) => (
          <div
            key={feat.title}
            className="group relative transition duration-300 hover:-translate-y-1.5"
          >
            {/* A blurred glow in the card's own colours behind it, plus a soft drop shadow: the card floats off the page. */}
            <div
              aria-hidden
              className="pointer-events-none absolute inset-x-4 top-6 -bottom-4 rounded-3xl opacity-60 blur-2xl transition-opacity duration-300 group-hover:opacity-90"
              style={{
                background: `linear-gradient(135deg, ${feat.colors[1]}, ${feat.colors[2]})`,
              }}
            />
            <div className="relative min-h-72 overflow-hidden rounded-3xl shadow-[0_28px_50px_-18px_rgba(15,46,41,0.55),0_10px_20px_-10px_rgba(0,0,0,0.3)] ring-1 ring-black/5 transition-shadow duration-300 group-hover:shadow-[0_40px_70px_-20px_rgba(15,46,41,0.65),0_14px_28px_-10px_rgba(0,0,0,0.35)]">
              <Shader f={feat} i={i} still={still} speed={1.6} />
              <div className="relative z-10 flex h-full min-h-72 flex-col rounded-3xl border border-white/20 bg-[#0b1f1b]/65 p-7 backdrop-blur-[2px]">
                <Icon f={feat} />
                <h3 className="mt-6 text-xl font-semibold text-white">
                  {feat.title}
                </h3>
                <p className="mt-2 flex-1 text-[15px] leading-relaxed text-white/80">
                  {feat.description}
                </p>
                <button
                  type="button"
                  onClick={() => setOpen(i)}
                  className="mt-6 inline-flex w-fit items-center gap-1.5 rounded-full border border-white/25 bg-white/10 px-4 py-2 text-sm font-semibold text-white backdrop-blur transition hover:bg-white/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/70"
                >
                  Learn more
                  <ArrowRight
                    className="size-4 transition-transform group-hover:translate-x-0.5"
                    aria-hidden
                  />
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>

      <Dialog.Root
        open={open !== null}
        onOpenChange={(o) => !o && setOpen(null)}
      >
        <Dialog.Portal>
          <Dialog.Backdrop className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm duration-200 data-[open]:animate-in data-[open]:fade-in-0 data-[closed]:animate-out data-[closed]:fade-out-0" />
          <Dialog.Popup className="fixed top-1/2 left-1/2 z-50 max-h-[calc(100dvh-2rem)] w-[calc(100%-2rem)] max-w-xl -translate-x-1/2 -translate-y-1/2 overflow-hidden rounded-[1.75rem] shadow-2xl outline-none duration-200 data-[open]:animate-in data-[open]:fade-in-0 data-[open]:zoom-in-95 data-[closed]:animate-out data-[closed]:fade-out-0 data-[closed]:zoom-out-95">
            {f && (
              <div className="relative flex max-h-[calc(100dvh-2rem)] flex-col">
                <div className="relative overflow-hidden px-7 pt-7 pb-6">
                  <Shader f={f} i={open ?? 0} still={still} speed={1.2} />
                  <div className="absolute inset-0 bg-[#0b1f1b]/60" />
                  <div className="relative flex items-center gap-4">
                    <Icon f={f} size="lg" />
                    <div>
                      <Dialog.Title className="text-2xl font-semibold text-white">
                        {f.title}
                      </Dialog.Title>
                      {f.details.plan && (
                        <p className="mt-1 text-xs font-medium tracking-wide text-white/70 uppercase">
                          {f.details.plan}
                        </p>
                      )}
                    </div>
                  </div>
                  <Dialog.Close
                    aria-label="Close"
                    className="absolute top-4 right-4 grid size-9 place-items-center rounded-full bg-white/15 text-white backdrop-blur transition hover:bg-white/25"
                  >
                    <X className="size-4" aria-hidden />
                  </Dialog.Close>
                </div>
                <div className="overflow-y-auto bg-background px-7 py-6">
                  <Dialog.Description className="text-[15px] leading-relaxed text-muted-foreground">
                    {f.details.lead}
                  </Dialog.Description>
                  <ul className="mt-5 space-y-4">
                    {f.details.points.map((p) => (
                      <li key={p.title} className="flex gap-3">
                        <CheckCircle2
                          className="mt-0.5 size-5 shrink-0 text-primary"
                          aria-hidden
                        />
                        <div>
                          <p className="font-semibold">{p.title}</p>
                          <p className="mt-0.5 text-sm leading-relaxed text-muted-foreground">
                            {p.body}
                          </p>
                        </div>
                      </li>
                    ))}
                  </ul>
                  {f.details.href && (
                    <Link href={f.details.href} className="mt-6 inline-flex items-center gap-1.5 text-sm font-semibold text-primary hover:underline">
                      Read the full guide <ArrowRight className="size-4" aria-hidden />
                    </Link>
                  )}
                  <Link
                    href="/signup/"
                    className="mt-5 inline-flex h-11 w-full items-center justify-center rounded-full bg-primary text-sm font-semibold text-primary-foreground transition hover:brightness-110"
                  >
                    Start your 7-day free trial
                  </Link>
                </div>
              </div>
            )}
          </Dialog.Popup>
        </Dialog.Portal>
      </Dialog.Root>
    </>
  );
}
