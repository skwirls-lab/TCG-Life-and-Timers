/**
 * TCGTempo brand mark (inline SVG so it inherits size and works offline).
 * Placeholder geometry: the BRAND lane owns the final design; keep this component's
 * props stable because the board's center menu button renders it.
 */
export interface AppMarkProps {
  size?: number;
  className?: string;
  /** Accessible name; omit when the mark is decorative next to visible text. */
  title?: string;
}

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
      <circle cx="32" cy="32" r="30" fill="#0b0d12" stroke="#38bdf8" strokeWidth="3" />
      <rect
        x="21"
        y="16"
        width="22"
        height="32"
        rx="3"
        fill="none"
        stroke="#e5e7eb"
        strokeWidth="3"
      />
      <path
        d="M32 32 L32 22 M32 32 L39 36"
        stroke="#38bdf8"
        strokeWidth="3"
        strokeLinecap="round"
      />
    </svg>
  );
}
