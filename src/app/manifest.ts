import type { MetadataRoute } from "next";

// Static export: written to `manifest.webmanifest` at build time.
export const dynamic = "force-static";

export default function manifest(): MetadataRoute.Manifest {
  return {
    id: "/",
    name: "TCGTempo",
    short_name: "TCGTempo",
    description:
      "Life & timers for any card game: life totals, counters and multiplayer chess clocks. Works offline.",
    start_url: "/",
    scope: "/",
    display: "standalone",
    orientation: "any",
    // Splash screen: the icon's own ink, so the icon tile blends into the splash.
    background_color: "#0b0d12",
    theme_color: "#000000",
    categories: ["games", "utilities"],
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icons/maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
