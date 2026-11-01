/**
 * Original die / coin / mana glyphs (TOOL-013, TOOL-011): simple polygons drawn here, no
 * third-party artwork or fonts. The number is plain SVG text in the app font.
 */
import { cn } from "@/lib/ui/cn";

const SHAPES: Record<number, string> = {
  4: "50,6 95,88 5,88",
  8: "50,3 95,50 50,97 5,50",
  10: "50,3 95,42 50,97 5,42",
  12: "50,5 94,37 77,90 23,90 6,37",
  20: "50,3 91,26 91,74 50,97 9,74 9,26",
};

interface DieProps {
  sides: number;
  /** Shown inside the die; defaults to the side count. */
  value?: number | string;
  size?: number;
  className?: string;
  /** Accessible label; decorative (aria-hidden) when omitted. */
  label?: string;
}

function fontSizeFor(text: string, sides: number) {
  const base = sides === 4 ? 30 : 38;
  if (text.length >= 4) return base * 0.6;
  if (text.length === 3) return base * 0.75;
  return base;
}

export function DieIcon({ sides, value, size = 56, className, label }: DieProps) {
  const text = String(value ?? sides);
  const poly = SHAPES[sides];
  const textY = sides === 4 ? 72 : sides === 10 ? 56 : 52;
  return (
    <svg
      viewBox="0 0 100 100"
      width={size}
      height={size}
      className={cn("shrink-0", className)}
      role={label ? "img" : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
    >
      {poly ? (
        <polygon
          points={poly}
          fill="currentColor"
          fillOpacity={0.14}
          stroke="currentColor"
          strokeWidth={4}
          strokeLinejoin="round"
        />
      ) : sides === 6 ? (
        <rect
          x={10}
          y={10}
          width={80}
          height={80}
          rx={14}
          fill="currentColor"
          fillOpacity={0.14}
          stroke="currentColor"
          strokeWidth={4}
        />
      ) : (
        <circle
          cx={50}
          cy={50}
          r={44}
          fill="currentColor"
          fillOpacity={0.14}
          stroke="currentColor"
          strokeWidth={4}
          strokeDasharray={sides === 100 ? "10 5" : undefined}
        />
      )}
      {sides === 20 && (
        <polygon
          points="50,22 78,70 22,70"
          fill="none"
          stroke="currentColor"
          strokeOpacity={0.35}
          strokeWidth={2}
        />
      )}
      <text
        x={50}
        y={textY}
        textAnchor="middle"
        dominantBaseline="central"
        fontSize={fontSizeFor(text, sides)}
        fontWeight={700}
        fill="currentColor"
      >
        {text}
      </text>
    </svg>
  );
}

export function CoinIcon({
  face,
  size = 56,
  className,
}: {
  face?: "heads" | "tails";
  size?: number;
  className?: string;
}) {
  return (
    <svg
      viewBox="0 0 100 100"
      width={size}
      height={size}
      className={cn("shrink-0", className)}
      aria-hidden
    >
      <circle
        cx={50}
        cy={50}
        r={44}
        fill="currentColor"
        fillOpacity={0.18}
        stroke="currentColor"
        strokeWidth={4}
      />
      <circle
        cx={50}
        cy={50}
        r={32}
        fill="none"
        stroke="currentColor"
        strokeOpacity={0.5}
        strokeWidth={3}
      />
      {face === "heads" && (
        <polygon
          points="50,28 57,44 74,44 60,55 65,72 50,62 35,72 40,55 26,44 43,44"
          fill="currentColor"
        />
      )}
      {face === "tails" && (
        <path
          d="M34 50 h32 M50 34 v32"
          stroke="currentColor"
          strokeWidth={7}
          strokeLinecap="round"
        />
      )}
    </svg>
  );
}

export const MANA_COLORS = ["W", "U", "B", "R", "G", "C"] as const;
export type ManaColor = (typeof MANA_COLORS)[number];

const MANA_FILL: Record<ManaColor, { bg: string; fg: string }> = {
  W: { bg: "#f6eecb", fg: "#3b3418" },
  U: { bg: "#3b82f6", fg: "#ffffff" },
  B: { bg: "#3a3540", fg: "#ffffff" },
  R: { bg: "#e5484d", fg: "#ffffff" },
  G: { bg: "#2f9e5b", fg: "#ffffff" },
  C: { bg: "#b9b4ad", fg: "#26231f" },
};

/** Original mana glyph: a colored disc with the color letter (no WotC symbol artwork). */
export function ManaGlyph({ color, size = 44 }: { color: ManaColor; size?: number }) {
  const { bg, fg } = MANA_FILL[color];
  return (
    <svg viewBox="0 0 100 100" width={size} height={size} aria-hidden className="shrink-0">
      <circle cx={50} cy={50} r={46} fill={bg} stroke="#00000055" strokeWidth={3} />
      <text
        x={50}
        y={52}
        textAnchor="middle"
        dominantBaseline="central"
        fontSize={48}
        fontWeight={800}
        fill={fg}
      >
        {color}
      </text>
    </svg>
  );
}
