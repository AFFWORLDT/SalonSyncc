"use client";

import type React from "react";
import { useSyncExternalStore } from "react";
import { Warp, type WarpProps } from "@paper-design/shaders-react";
import { cn } from "@/lib/utils";

export interface ShaderFeature {
  title: string;
  description: string;
  icon: React.ReactNode;
  /** Warp colours, darkest first. */
  colors: string[];
  shape?: NonNullable<WarpProps["shape"]>;
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
    () => true
  );
}

/** Feature cards over moving Warp shaders (adapted from the shader feature-cards block), with a dark glass face. */
export function FeatureShaderCards({ features, className }: { features: ShaderFeature[]; className?: string }) {
  const still = useReducedMotion();
  return (
    <div className={cn("grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3", className)}>
      {features.map((f, i) => (
        <div key={f.title} className="group relative min-h-72 overflow-hidden rounded-3xl shadow-xl shadow-black/10 transition duration-300 hover:-translate-y-1 hover:shadow-2xl">
          <Warp
            className="absolute inset-0"
            style={{ height: "100%", width: "100%" }}
            colors={f.colors}
            proportion={0.35 + (i % 3) * 0.05}
            softness={1}
            distortion={0.18}
            swirl={0.8}
            swirlIterations={10}
            shape={f.shape ?? (i % 2 ? "stripes" : "checks")}
            shapeScale={0.1}
            speed={still ? 0 : 0.6}
            maxPixelCount={520 * 380}
          />
          <div className="relative z-10 flex h-full min-h-72 flex-col rounded-3xl border border-white/20 bg-[#0b1f1b]/70 p-7 backdrop-blur-[2px]">
            <div className="grid size-14 place-items-center rounded-2xl bg-white shadow-lg shadow-black/20 ring-1 ring-white/60 [&_svg]:size-8">{f.icon}</div>
            <h3 className="mt-6 text-xl font-semibold text-white">{f.title}</h3>
            <p className="mt-2 text-[15px] leading-relaxed text-white/80">{f.description}</p>
          </div>
        </div>
      ))}
    </div>
  );
}
