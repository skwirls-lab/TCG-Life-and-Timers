/**
 * TCGTempo brand mark (inline SVG so it inherits size and works offline).
 *
 * Two fanned cards on a dark disc: the back card in the app accent, the front card carries a
 * turn-timer sweep (a quarter wedge), so the mark reads as "card game + tempo". The palette is
 * fixed (it is a badge, not themed) so it reads the same on dark, light and contrast themes.
 * `src/assets/brand/logo.svg` uses the same geometry for the PWA icons (`npm run gen:icons`).
 *
 * Keep the props stable: the board's center menu button renders this component.
 */
export interface AppMarkProps {
  size?: number;
  className?: string;
  /** Accessible name; omit when the mark is decorative next to visible text. */
  title?: string;
}

/** Brand palette (matches the dark theme's --color-bg / --color-accent / --color-fg). */
export const BRAND_INK = "#0b0d12";
export const BRAND_ACCENT = "#38bdf8";
export const BRAND_CARD = "#f5f6f8";

export function AppMark({ size = 40, className, title }: AppMarkProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 64 64"
      className={className}
      role={title ? "img" : undefined}
      aria-hidden={title ? undefined : true}
      aria-label={title}
    >
      <circle cx="32" cy="32" r="30" fill={BRAND_INK} stroke={BRAND_ACCENT} strokeWidth="3" />
      {/* back card */}
      <rect
        x="13"
        y="16"
        width="22"
        height="31"
        rx="4"
        fill={BRAND_ACCENT}
        transform="rotate(-14 24 31.5)"
      />
      {/* front card with the timer sweep */}
      <g transform="rotate(10 38 30.5)">
        <rect
          x="27"
          y="15"
          width="22"
          height="31"
          rx="4"
          fill={BRAND_CARD}
          stroke={BRAND_INK}
          strokeWidth="2"
        />
        <circle cx="38" cy="30.5" r="7.5" fill="none" stroke={BRAND_INK} strokeWidth="2.6" />
        <path d="M38 30.5 V23 A7.5 7.5 0 0 1 45.5 30.5 Z" fill={BRAND_INK} />
      </g>
    </svg>
  );
}
