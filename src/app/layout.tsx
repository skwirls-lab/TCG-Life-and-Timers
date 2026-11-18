import type { Metadata, Viewport } from "next";
import "./globals.css";
import { Providers } from "@/features/pwa/Providers";

export const metadata: Metadata = {
  // Child pages set a short title ("Profiles"); the template brands it ("Profiles · TCGTempo").
  title: { default: "TCGTempo", template: "%s · TCGTempo" },
  description:
    "TCGTempo: life & timers for any card game. Life totals, counters and multiplayer chess clocks.",
  applicationName: "TCGTempo",
  appleWebApp: { capable: true, statusBarStyle: "black-translucent", title: "TCGTempo" },
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
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
