"use client";

import DoodleCrewFooter, { type CrewMember, type FooterColumn } from "@/components/ui/doodle-crew-footer";
import { BRAND_NAME, COMPANY, SUPPORT_EMAIL } from "@/lib/brand";
import { FEATURE_PAGES } from "@/lib/content";

const COLUMNS: FooterColumn[] = [
  {
    title: "Product",
    links: [
      { label: "Start free trial", href: "/signup/" },
      { label: "Sign in", href: "/login/" },
      { label: "Pricing", href: "/pricing/" },
      { label: "Features", href: "/#features" },
    ],
  },
  { title: "Features", links: FEATURE_PAGES.map((p) => ({ label: p.label, href: `/${p.slug}/` })) },
  {
    title: "Across the UAE",
    links: [{ label: "Dubai" }, { label: "Abu Dhabi" }, { label: "Sharjah" }, { label: "Ajman & the Northern Emirates" }],
  },
  {
    title: "Help",
    links: [...(SUPPORT_EMAIL ? [{ label: "Email us", href: `mailto:${SUPPORT_EMAIL}` }] : []), { label: "Blog", href: "/blog/" }, { label: "Questions", href: "/#faq" }, { label: "العربية", href: "/ar/" }, { label: "Pricing", href: "/pricing/" }],
  },
  { title: "Company", links: [{ label: COMPANY }] },
];

// S A L O N K I T — letters 0…7. Every line is something the app really does.
const CREW: CrewMember[] = [
  { kind: "yeti", letter: 0, seat: "front", offset: -0.32, name: "Bruno", says: "Bill done. Next customer!" },
  { kind: "bird", letter: 2, seat: "top", offset: 0.02, name: "Pip", says: "Your commission is ready." },
  { kind: "mushroom", letter: 3, seat: "front", offset: 0.12, scale: 0.95, name: "Morel", says: "Daily sheet, all balanced." },
  { kind: "kid", letter: 4, seat: "top", offset: -0.05, name: "Juno", says: "Time for a fresh cut?" },
  { kind: "ghost", letter: 6, seat: "behind", offset: 0, name: "Boo", says: "5 stars on Google!" },
  { kind: "cat", letter: 7, seat: "front", offset: 0.42, flip: true, name: "Patch", says: "Sent on WhatsApp." },
];

/** The home page footer: the sketchbook SALONKIT wordmark with the site's links (deHertz Type's footer). */
export function SiteFooter() {
  return (
    <DoodleCrewFooter
      logoSrc="/brand/mark.png"
      wordmark="SALONKIT"
      brand={BRAND_NAME}
      blurb="The salon app made in Dubai: sales, VAT bills, staff commission, WhatsApp reminders and reports, in AED, on your phone."
      tagline="Ring up the bill. We'll do the maths, the sheet and the reminders."
      columns={COLUMNS}
      actions={[
        { label: "See pricing", href: "/pricing/", icon: "star", variant: "outline" },
        { label: "Start free trial", href: "/signup/", icon: "bolt", variant: "solid" },
      ]}
      copyright={`© ${new Date().getFullYear()} ${COMPANY}. All rights reserved.`}
      legal={[
        { label: "Privacy", href: "/privacy/" },
        { label: "Terms", href: "/terms/" },
        { label: "Pricing", href: "/pricing/" },
      ]}
      socials={SUPPORT_EMAIL ? [{ label: SUPPORT_EMAIL, href: `mailto:${SUPPORT_EMAIL}` }] : []}
      crew={CREW}
      doodles={["sparkle", "star", "heart", "bolt", "spiral", "plane", "sparkle", "star"]}
      palette={{ background: "#f6f2e9", ink: "#1c1b18", accent: "#1f7a6a" }}
      serifFamily="var(--font-gsf), ui-sans-serif, system-ui, sans-serif"
      className="border-t border-[#e0d9cb]"
    />
  );
}
