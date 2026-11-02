import type { Metadata } from "next";
import { PlatformShell } from "@/components/platform/shell";

export const metadata: Metadata = { title: "Super admin" };

export default function PlatformLayout({ children }: { children: React.ReactNode }) {
  return <PlatformShell>{children}</PlatformShell>;
}
