import type { Metadata } from "next";

/** Sign-in finds a salon; nothing here for search results. */
export const metadata: Metadata = { title: "Sign in", robots: { index: false, follow: true }, alternates: { canonical: "/login/" } };

export default function LoginLayout({ children }: { children: React.ReactNode }) {
  return children;
}
