/**
 * Non-art seat backgrounds (SET-002 "Colors"): 16 curated gradients + solid colors, and
 * `artToCss` for rendering any ArtRef as a CSS background (SET-003 scrim handled by callers).
 * Pure module (no React runtime) so the board lane can reuse it.
 */
import type { CSSProperties } from "react";
import { SEAT_COLORS, type ArtRef } from "@/engine";

export interface GradientDef {
  /** Stable id; the display name is the i18n key `seat.gradient.<id>`. */
  id: string;
  css: string;
  /** Representative accent (history dots, SEAT_SET_COLOR). */
  accent: string;
}

/** 16 curated gradients. Order is the picker order. */
export const GRADIENTS: readonly GradientDef[] = [
  {
    id: "sunset",
    css: "linear-gradient(135deg, #f97316 0%, #db2777 55%, #7c3aed 100%)",
    accent: "#fb923c",
  },
  {
    id: "ocean",
    css: "linear-gradient(135deg, #0ea5e9 0%, #1d4ed8 60%, #1e1b4b 100%)",
    accent: "#60a5fa",
  },
  {
    id: "forest",
    css: "linear-gradient(135deg, #22c55e 0%, #15803d 55%, #052e16 100%)",
    accent: "#34d399",
  },
  {
    id: "ember",
    css: "linear-gradient(160deg, #fde047 0%, #ef4444 50%, #450a0a 100%)",
    accent: "#f87171",
  },
  {
    id: "aurora",
    css: "linear-gradient(135deg, #2dd4bf 0%, #6366f1 55%, #a21caf 100%)",
    accent: "#2dd4bf",
  },
  {
    id: "dusk",
    css: "linear-gradient(180deg, #312e81 0%, #7c3aed 50%, #f472b6 100%)",
    accent: "#a78bfa",
  },
  {
    id: "rose",
    css: "linear-gradient(135deg, #fda4af 0%, #e11d48 60%, #4c0519 100%)",
    accent: "#f472b6",
  },
  {
    id: "gold",
    css: "linear-gradient(135deg, #fef08a 0%, #eab308 45%, #713f12 100%)",
    accent: "#facc15",
  },
  {
    id: "glacier",
    css: "linear-gradient(160deg, #e0f2fe 0%, #7dd3fc 40%, #0c4a6e 100%)",
    accent: "#7dd3fc",
  },
  {
    id: "swamp",
    css: "linear-gradient(135deg, #3f6212 0%, #1c1917 60%, #000000 100%)",
    accent: "#84cc16",
  },
  {
    id: "plains",
    css: "linear-gradient(135deg, #fffbeb 0%, #fcd34d 50%, #b45309 100%)",
    accent: "#fcd34d",
  },
  {
    id: "island",
    css: "linear-gradient(135deg, #bae6fd 0%, #2563eb 55%, #172554 100%)",
    accent: "#3b82f6",
  },
  {
    id: "mountain",
    css: "linear-gradient(135deg, #fecaca 0%, #dc2626 50%, #1c0a0a 100%)",
    accent: "#ef4444",
  },
  {
    id: "void",
    css: "linear-gradient(135deg, #52525b 0%, #18181b 55%, #000000 100%)",
    accent: "#a1a1aa",
  },
  {
    id: "neon",
    css: "linear-gradient(135deg, #22d3ee 0%, #a3e635 50%, #facc15 100%)",
    accent: "#22d3ee",
  },
  {
    id: "nebula",
    css: "radial-gradient(circle at 30% 30%, #f0abfc 0%, #7e22ce 40%, #0f172a 100%)",
    accent: "#c084fc",
  },
];

/** The 8 seat palette colors (solid picker + default backgrounds). */
export const PALETTE: readonly string[] = SEAT_COLORS;

export function gradientById(id: string): GradientDef | undefined {
  return GRADIENTS.find((g) => g.id === id);
}

/** Gradient whose CSS (or id) matches an ArtRef value. */
export function gradientFor(value: string): GradientDef | undefined {
  return GRADIENTS.find((g) => g.css === value || g.id === value);
}

/** HSL (h 0–360, s/l 0–100) → #rrggbb. */
export function hslToHex(h: number, s: number, l: number): string {
  const hh = ((h % 360) + 360) % 360;
  const ss = Math.max(0, Math.min(100, s)) / 100;
  const ll = Math.max(0, Math.min(100, l)) / 100;
  const a = ss * Math.min(ll, 1 - ll);
  const f = (n: number) => {
    const k = (n + hh / 30) % 12;
    const c = ll - a * Math.max(-1, Math.min(k - 3, 9 - k, 1));
    return Math.round(c * 255)
      .toString(16)
      .padStart(2, "0");
  };
  return `#${f(0)}${f(8)}${f(4)}`;
}

/** Hue (0–359) used by the hue slider for a solid color seat background. */
export const solidFromHue = (hue: number) => hslToHex(hue, 70, 50);

const URL_LIKE = /^(https?:|blob:|data:|\/)/;

/** Darken a solid color into a soft vertical gradient so solid seats still have depth. */
function solidCss(color: string): string {
  return `linear-gradient(180deg, ${color} 0%, color-mix(in srgb, ${color} 55%, #000) 100%)`;
}

/**
 * CSS background for a seat's ArtRef (SET-002). `fallbackColor` is used for 'default', missing
 * art, and art kinds that need resolving elsewhere (an uploaded art id that isn't a URL).
 */
export function artToCss(art: ArtRef | undefined, fallbackColor: string): CSSProperties {
  if (!art || art.kind === "default") return { background: solidCss(fallbackColor) };
  if (art.kind === "gradient") {
    const g = gradientFor(art.value);
    return { background: g ? g.css : art.value || solidCss(fallbackColor) };
  }
  if (art.kind === "solid") return { background: solidCss(art.value || fallbackColor) };
  if (!URL_LIKE.test(art.value)) return { background: solidCss(fallbackColor) };
  const focal = art.focal;
  const zoom = focal && focal.zoom > 1 ? focal.zoom : 1;
  return {
    backgroundColor: fallbackColor,
    backgroundImage: `url("${art.value.replace(/"/g, "%22")}")`,
    backgroundSize: zoom > 1 ? `${Math.round(zoom * 100)}% auto` : "cover",
    backgroundPosition: focal
      ? `${Math.round(focal.x * 100)}% ${Math.round(focal.y * 100)}%`
      : "center",
    backgroundRepeat: "no-repeat",
  };
}
