"use client";

import * as React from "react";
import { useEffect, useId, useState } from "react";
import { Eye, EyeOff } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { MeshGradient } from "@paper-design/shaders-react";
import type { LoginScene } from "@/lib/login-scenes";

/**
 * Split-screen sign-in layout (adapted from the EaseMize auth UI): the form on the left, a full-height photo with a
 * typed quote on the right (md and up). Built on the app's own Input/Label (base-ui), so no Radix packages.
 */

export interface TypewriterProps {
  text: string | string[];
  speed?: number;
  cursor?: string;
  loop?: boolean;
  deleteSpeed?: number;
  delay?: number;
  className?: string;
}

/** Types `text` out letter by letter; with an array and `loop`, deletes and moves to the next line. */
export function Typewriter({ text, speed = 100, cursor = "|", loop = false, deleteSpeed = 50, delay = 1500, className }: TypewriterProps) {
  const [displayText, setDisplayText] = useState("");
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isDeleting, setIsDeleting] = useState(false);
  const [textArrayIndex, setTextArrayIndex] = useState(0);
  const textArray = Array.isArray(text) ? text : [text];
  const currentText = textArray[textArrayIndex] || "";

  useEffect(() => {
    if (!currentText) return;
    let pause: ReturnType<typeof setTimeout> | undefined;
    const timeout = setTimeout(
      () => {
        if (!isDeleting) {
          if (currentIndex < currentText.length) {
            setDisplayText((prev) => prev + currentText[currentIndex]);
            setCurrentIndex((prev) => prev + 1);
          } else if (loop) {
            pause = setTimeout(() => setIsDeleting(true), delay);
          }
        } else if (displayText.length > 0) {
          setDisplayText((prev) => prev.slice(0, -1));
        } else {
          setIsDeleting(false);
          setCurrentIndex(0);
          setTextArrayIndex((prev) => (prev + 1) % textArray.length);
        }
      },
      isDeleting ? deleteSpeed : speed
    );
    return () => {
      clearTimeout(timeout);
      if (pause) clearTimeout(pause);
    };
  }, [currentIndex, isDeleting, currentText, loop, speed, deleteSpeed, delay, displayText, textArray.length]);

  return (
    <span className={className}>
      {displayText}
      <span className="animate-pulse" aria-hidden>
        {cursor}
      </span>
    </span>
  );
}

export interface PasswordInputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string;
}

/** Password field with a show/hide eye button. */
export const PasswordInput = React.forwardRef<HTMLInputElement, PasswordInputProps>(({ className, label, id: idProp, ...props }, ref) => {
  const auto = useId();
  const id = idProp ?? auto;
  const [show, setShow] = useState(false);
  return (
    <div className="grid w-full items-center gap-2">
      {label && <Label htmlFor={id}>{label}</Label>}
      <div className="relative">
        <Input id={id} type={show ? "text" : "password"} className={cn("pe-10", className)} ref={ref} {...props} />
        <button
          type="button"
          onClick={() => setShow((s) => !s)}
          className="absolute inset-y-0 end-0 flex h-full w-10 items-center justify-center text-muted-foreground/80 transition-colors hover:text-foreground focus-visible:text-foreground focus-visible:outline-none"
          aria-label={show ? "Hide password" : "Show password"}
        >
          {show ? <EyeOff className="size-4" aria-hidden /> : <Eye className="size-4" aria-hidden />}
        </button>
      </div>
    </div>
  );
});
PasswordInput.displayName = "PasswordInput";

export interface AuthSplitProps {
  children: React.ReactNode;
  scene: LoginScene | null;
  quote: { text: string | string[]; author: string };
}

/** Reduced-motion users get a still gradient. */
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

/**
 * The page frame: a slowly moving mesh (colours from the photo) behind a glass form card, and the photo with a typed
 * quote on the right (md and up). The photo's left edge fades into the mesh so the two halves read as one scene.
 */
export function AuthSplit({ children, scene, quote }: AuthSplitProps) {
  const reduce = useReducedMotion();
  const mesh = scene?.mesh ?? ["#141c16", "#1d4a42", "#1f7a6a", "#b8935a", "#0f2e29"];
  return (
    <div className="relative min-h-full w-full overflow-hidden md:grid md:grid-cols-2">
      <style>{`input[type="password"]::-ms-reveal,input[type="password"]::-ms-clear{display:none}`}</style>
      <div aria-hidden className="pointer-events-none absolute inset-0" style={{ background: `linear-gradient(135deg, ${mesh[0]}, ${mesh[2]})` }}>
        {scene && (
          <MeshGradient className="h-full w-full" colors={mesh} speed={reduce ? 0 : 0.25} distortion={0.8} swirl={0.15} grainOverlay={0.05} maxPixelCount={1280 * 900} />
        )}
        <div className="absolute inset-0 bg-black/10" />
      </div>
      <div className="relative z-10 flex min-h-full items-center justify-center p-6 md:order-2 md:py-12">
        <div className="w-full max-w-[460px] rounded-[2rem] border border-white/25 bg-white/10 p-2 shadow-[0_40px_90px_-25px_rgba(0,0,0,0.6)] backdrop-blur-md transition-transform duration-500 md:-translate-y-2">
          <div className="relative overflow-hidden rounded-[1.6rem] border border-white/45 p-7 shadow-[inset_0_1px_0_rgba(255,255,255,0.7),0_12px_30px_-12px_rgba(0,0,0,0.35)] backdrop-blur-2xl backdrop-saturate-150 [background-color:color-mix(in_oklab,var(--background)_58%,transparent)] sm:p-9">
            <div aria-hidden className="pointer-events-none absolute inset-x-0 top-0 h-40" style={{ background: "linear-gradient(180deg, rgba(255,255,255,0.35), rgba(255,255,255,0))" }} />
            <div className="relative">{children}</div>
          </div>
        </div>
      </div>
      <div className="relative hidden overflow-hidden md:order-1 md:block">
        {scene && (
          <div
            key={scene.src}
            className="absolute inset-0 animate-in fade-in bg-cover bg-center duration-700"
            style={{
              backgroundImage: `url(${scene.src})`,
              maskImage: "linear-gradient(to right, #000 55%, transparent 100%)",
              WebkitMaskImage: "linear-gradient(to right, #000 55%, transparent 100%)",
            }}
            role="img"
            aria-label={scene.alt}
          />
        )}
        <div className="absolute inset-x-0 bottom-0 h-48" style={{ background: `linear-gradient(to top, ${mesh[0]}e6, transparent)`, maskImage: "linear-gradient(to right, #000 55%, transparent 100%)", WebkitMaskImage: "linear-gradient(to right, #000 55%, transparent 100%)" }} />
        <div className="relative z-10 flex h-full flex-col items-center justify-end p-6 pb-10">
          <blockquote className="space-y-2 text-center text-white">
            <p className="text-lg font-medium drop-shadow">
              “<Typewriter text={quote.text} speed={60} loop={Array.isArray(quote.text)} delay={2500} />”
            </p>
            <cite className="block text-sm font-light not-italic text-white/75">— {quote.author}</cite>
          </blockquote>
        </div>
      </div>
    </div>
  );
}
