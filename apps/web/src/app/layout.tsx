import type { Metadata, Viewport } from "next";
import { appFontClassName } from "@/components/theme/fonts";
import { AppThemeProvider } from "@/components/theme/theme-provider";
import { AuthProvider } from "@/lib/auth-context";
import { AppShell } from "@/components/admin/app-shell";
import { EnvBadge } from "@/components/app/env-badge";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: "FM Salon", template: "%s — FM Salon" },
  description: "Faizan Mohammed Gents Salon — daily sales, expenses and reports.",
  manifest: "/manifest.webmanifest",
  appleWebApp: { capable: true, title: "FM Salon", statusBarStyle: "default" },
  robots: { index: false, follow: false },
};

// Zoom stays enabled; inputs are 16px on touch instead (globals.css).
// theme-color matches the top bar (the theme background); AppThemeProvider
// rewrites it when the in-app appearance overrides the OS setting.
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  interactiveWidget: "resizes-content",
  colorScheme: "light dark",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#F4F4F2" },
    { media: "(prefers-color-scheme: dark)", color: "#000000" },
  ],
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body>
        <EnvBadge />
        <AppThemeProvider fontClassName={appFontClassName}>
          <AuthProvider>
            <AppShell>{children}</AppShell>
          </AuthProvider>
        </AppThemeProvider>
      </body>
    </html>
  );
}
