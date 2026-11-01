import type { Metadata, Viewport } from "next";
import "./globals.css";
import { Providers } from "@/features/pwa/Providers";
import { ConsentBanner } from "@/features/consent/ConsentBanner";
import { InstallPromptHost } from "@/features/install/InstallPromptHost";

export const metadata: Metadata = {
  title: "TCG Life & Timers",
  description: "Life tracking and multiplayer chess clocks for trading card games.",
  applicationName: "TCG Life & Timers",
  appleWebApp: { capable: true, statusBarStyle: "black-translucent", title: "LifeTimers" },
  icons: {
    icon: [{ url: "/icons/favicon-32.png", sizes: "32x32" }],
    apple: [{ url: "/icons/apple-touch-icon.png", sizes: "180x180" }],
  },
  formatDetection: { telephone: false },
};

export const viewport: Viewport = {
  themeColor: "#000000",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  colorScheme: "dark",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" data-theme="dark">
      <body className="min-h-dvh antialiased">
        <Providers>
          {children}
          {/* HARDEN (T8.3 / T8.7): consent banner (LEG-004) and install offer (PWA-003). */}
          <ConsentBanner />
          <InstallPromptHost />
        </Providers>
      </body>
    </html>
  );
}
