"use client";

import { MeshGradient, PulsingBorder } from "@paper-design/shaders-react";
import { useEffect, useRef, useState, type ReactNode } from "react";

/** True when the visitor asked for less motion. */
function useReducedMotion(): boolean {
  const [reduce, setReduce] = useState(false);
  useEffect(() => {
    if (typeof window.matchMedia !== "function") return;
    const m = window.matchMedia("(prefers-reduced-motion: reduce)");
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setReduce(m.matches);
    const on = () => setReduce(m.matches);
    m.addEventListener("change", on);
    return () => m.removeEventListener("change", on);
  }, []);
  return reduce;
}

/** Deep teals with a touch of the SalonKit gold (the type.dehertz.com mesh). */
export const TEAL_MESH = ["#0f2e29", "#1d4a42", "#1f7a6a", "#2a9d88", "#b8935a"];

/** Mounts children only while the element is on (or near) screen, so idle WebGL never runs. */
function useNearViewport<T extends Element>() {
  const ref = useRef<T>(null);
  const [near, setNear] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const io = new IntersectionObserver(([entry]) => setNear(entry.isIntersecting), { rootMargin: "200px" });
    io.observe(el);
    return () => io.disconnect();
  }, []);
  return { ref, near };
}

/**
 * A slowly moving mesh-gradient background (Paper shaders). Fills its
 * positioned parent; the solid `fallback` colour shows before WebGL starts
 * and when it can't. Still under reduced motion.
 */
export function ShaderBackdrop({
  colors = TEAL_MESH,
  speed = 0.3,
  distortion = 0.8,
  swirl = 0.15,
  fallback = "var(--panel)",
  className = "",
}: {
  colors?: string[];
  speed?: number;
  distortion?: number;
  swirl?: number;
  fallback?: string;
  className?: string;
}) {
  const reduce = useReducedMotion();
  const { ref, near } = useNearViewport<HTMLDivElement>();
  return (
    <div ref={ref} aria-hidden className={`pointer-events-none absolute inset-0 ${className}`} style={{ background: fallback }}>
      {near && (
        <MeshGradient
          className="h-full w-full"
          colors={colors}
          speed={reduce ? 0 : speed}
          distortion={distortion}
          swirl={swirl}
          grainOverlay={0.04}
          maxPixelCount={1920 * 1080}
        />
      )}
    </div>
  );
}

/** A soft, pulsing ring of light around its child (an app icon). */
export function PulsingRing({ size = 120, children }: { size?: number; children: ReactNode }) {
  const reduce = useReducedMotion();
  const { ref, near } = useNearViewport<HTMLDivElement>();
  return (
    <div ref={ref} className="relative flex items-center justify-center" style={{ width: size, height: size }}>
      {near && (
        <PulsingBorder
          aria-hidden
          className="pointer-events-none absolute inset-0"
          colors={["#3cc2a8", "#2a9d88", "#d9b77a"]}
          colorBack="#00000000"
          aspectRatio="square"
          scale={0.6}
          roundness={1}
          thickness={0}
          softness={0.75}
          intensity={0.35}
          bloom={0.5}
          spots={3}
          spotSize={0.4}
          pulse={0.5}
          smoke={1}
          smokeSize={0}
          speed={reduce ? 0 : 0.8}
          style={{ width: size, height: size }}
        />
      )}
      <div className="relative">{children}</div>
    </div>
  );
}
