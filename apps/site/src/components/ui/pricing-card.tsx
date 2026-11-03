import * as React from "react";
import { cn } from "@/lib/utils";

/** Pricing card parts (adapted from the shadcn pricing-card block to SalonKit's glass, cream and green). */
function Card({ className, ...props }: React.ComponentProps<"div">) {
  return <div className={cn("glass relative flex w-full flex-col rounded-3xl p-1.5 shadow-xl shadow-black/5", className)} {...props} />;
}

function Header({ className, children, glassEffect = true, ...props }: React.ComponentProps<"div"> & { glassEffect?: boolean }) {
  return (
    <div className={cn("relative mb-2 overflow-hidden rounded-[1.25rem] border border-border bg-muted/70 p-5 dark:bg-muted/40", className)} {...props}>
      {glassEffect && (
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-x-0 top-0 h-40 rounded-[inherit]"
          style={{ background: "linear-gradient(180deg, rgba(255,255,255,0.55) 0%, rgba(255,255,255,0.15) 45%, rgba(255,255,255,0) 100%)" }}
        />
      )}
      <div className="relative">{children}</div>
    </div>
  );
}

function Plan({ className, ...props }: React.ComponentProps<"div">) {
  return <div className={cn("mb-6 flex items-center justify-between gap-3", className)} {...props} />;
}

function Description({ className, ...props }: React.ComponentProps<"p">) {
  return <p className={cn("text-sm text-muted-foreground", className)} {...props} />;
}

function PlanName({ className, ...props }: React.ComponentProps<"div">) {
  return <div className={cn("flex items-center gap-2 text-base font-semibold [&_svg:not([class*='size-'])]:size-4", className)} {...props} />;
}

function Badge({ className, ...props }: React.ComponentProps<"span">) {
  return <span className={cn("rounded-full border border-foreground/15 px-2.5 py-0.5 text-xs text-foreground/75", className)} {...props} />;
}

function Price({ className, ...props }: React.ComponentProps<"div">) {
  return <div className={cn("mb-1 flex items-end gap-1.5", className)} {...props} />;
}

function MainPrice({ className, ...props }: React.ComponentProps<"span">) {
  return <span className={cn("text-4xl font-semibold tracking-tight", className)} {...props} />;
}

function Period({ className, ...props }: React.ComponentProps<"span">) {
  return <span className={cn("pb-1.5 text-sm text-muted-foreground", className)} {...props} />;
}

function OriginalPrice({ className, ...props }: React.ComponentProps<"span">) {
  return <span className={cn("mr-1 ml-auto pb-1 text-lg text-muted-foreground line-through", className)} {...props} />;
}

function Body({ className, ...props }: React.ComponentProps<"div">) {
  return <div className={cn("flex flex-1 flex-col gap-5 p-4", className)} {...props} />;
}

function List({ className, ...props }: React.ComponentProps<"ul">) {
  return <ul className={cn("space-y-2.5", className)} {...props} />;
}

function ListItem({ className, ...props }: React.ComponentProps<"li">) {
  return <li className={cn("flex items-start gap-2.5 text-[15px]", className)} {...props} />;
}

function Separator({ children = "Upgrade to get", className, ...props }: React.ComponentProps<"div"> & { children?: string }) {
  return (
    <div className={cn("flex items-center gap-3 text-xs text-muted-foreground", className)} {...props}>
      <span className="h-px flex-1 bg-foreground/15" />
      <span className="shrink-0">{children}</span>
      <span className="h-px flex-1 bg-foreground/15" />
    </div>
  );
}

export { Card, Header, Description, Plan, PlanName, Badge, Price, MainPrice, Period, OriginalPrice, Body, List, ListItem, Separator };
