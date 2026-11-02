"use client";

import * as React from "react";
import { useEffect, useId, useState } from "react";
import { Eye, EyeOff } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

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
  image: { src: string; alt: string };
  quote: { text: string | string[]; author: string };
}

/** The page frame: form column + photo column with a typed quote over a bottom fade. */
export function AuthSplit({ children, image, quote }: AuthSplitProps) {
  return (
    <div className="min-h-full w-full md:grid md:grid-cols-2">
      <style>{`input[type="password"]::-ms-reveal,input[type="password"]::-ms-clear{display:none}`}</style>
      <div className="flex min-h-full items-center justify-center p-6 md:py-12">
        <div className="glass w-full max-w-[420px] rounded-2xl p-6 shadow-xl sm:p-8">{children}</div>
      </div>
      <div className="relative hidden bg-cover bg-center md:block" style={{ backgroundImage: `url(${image.src})` }} role="img" aria-label={image.alt}>
        <div className="absolute inset-0 bg-black/30" />
        <div className="absolute inset-x-0 bottom-0 h-40 bg-gradient-to-t from-background to-transparent" />
        <div className="relative z-10 flex h-full flex-col items-center justify-end p-6 pb-10">
          <blockquote className="space-y-2 text-center text-foreground">
            <p className="text-lg font-medium">
              “<Typewriter text={quote.text} speed={60} loop={Array.isArray(quote.text)} delay={2500} />”
            </p>
            <cite className="block text-sm font-light not-italic text-muted-foreground">— {quote.author}</cite>
          </blockquote>
        </div>
      </div>
    </div>
  );
}
