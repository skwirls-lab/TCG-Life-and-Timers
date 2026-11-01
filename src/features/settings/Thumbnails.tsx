"use client";
import type { ReactNode } from "react";
import { cn } from "@/lib/ui/cn";
import { t } from "@/lib/i18n";
import { layoutVariantsFor, type LayoutVariant } from "./layoutVariants";

export interface ThumbOption<T extends string> {
  value: T;
  label: string;
  preview: ReactNode;
}

interface Props<T extends string> {
  label: string;
  value: T;
  options: ThumbOption<T>[];
  onChange: (v: T) => void;
  testId?: string;
}

/** Row of preview thumbnails with a highlight ring on the selected one (LifeTap Layout row). */
export function ThumbnailPicker<T extends string>({
  label,
  value,
  options,
  onChange,
  testId,
}: Props<T>) {
  return (
    <div
      role="radiogroup"
      aria-label={label}
      data-testid={testId}
      className="flex flex-wrap gap-3 pb-2"
    >
      {options.map((o) => {
        const selected = o.value === value;
        return (
          <button
            key={o.value}
            type="button"
            role="radio"
            aria-checked={selected}
            aria-label={o.label}
            data-testid={testId ? `${testId}-${o.value}` : undefined}
            onClick={() => onChange(o.value)}
            className={cn(
              "flex w-24 flex-col items-center gap-1 rounded-2xl p-2 text-sm transition",
              "focus-visible:outline-2 focus-visible:outline-accent",
              selected ? "bg-surface-2 ring-2 ring-accent" : "bg-surface hover:bg-surface-2",
            )}
          >
            <span aria-hidden className="block h-20 w-14">
              {o.preview}
            </span>
            <span className="text-center leading-tight text-fg-muted">{o.label}</span>
          </button>
        );
      })}
    </div>
  );
}

function LayoutPreview({ variant }: { variant: LayoutVariant }) {
  return (
    <span className="relative block h-full w-full rounded-md bg-bg">
      {variant.seats.map((seat, i) => (
        <span
          key={i}
          className="absolute rounded-sm"
          style={{
            left: `calc(${seat.rect.x * 100}% + 1px)`,
            top: `calc(${seat.rect.y * 100}% + 1px)`,
            width: `calc(${seat.rect.w * 100}% - 2px)`,
            height: `calc(${seat.rect.h * 100}% - 2px)`,
            background: `var(--color-seat-${(i % 8) + 1})`,
            opacity: 0.85,
          }}
        >
          {/* a bar on the edge where that player sits (rotation 0 = bottom, 90 = left, …) */}
          <span className="absolute bg-white/80" style={FACING_BAR[seat.rotation]} />
        </span>
      ))}
    </span>
  );
}

const FACING_BAR: Record<number, React.CSSProperties> = {
  0: { left: "20%", right: "20%", bottom: 2, height: 2 },
  180: { left: "20%", right: "20%", top: 2, height: 2 },
  90: { top: "20%", bottom: "20%", left: 2, width: 2 },
  270: { top: "20%", bottom: "20%", right: 2, width: 2 },
};

export function layoutThumbOptions(players: number): ThumbOption<string>[] {
  return layoutVariantsFor(players).map((v) => ({
    value: v.id,
    label: t(v.labelKey as Parameters<typeof t>[0]),
    preview: <LayoutPreview variant={v} />,
  }));
}

/** SET-030 card layout previews: Default / Name only / Big font. */
export function CardLayoutPreview({ kind }: { kind: "default" | "nameOnly" | "bigFont" }) {
  return (
    <span className="relative flex h-full w-full flex-col items-center justify-center gap-1 rounded-md bg-seat-2/70 p-1">
      {kind !== "bigFont" && <span className="h-1.5 w-8 rounded-full bg-black/60" />}
      <span
        className={cn(
          "font-bold leading-none text-white",
          kind === "bigFont" ? "text-3xl" : "text-xl",
        )}
      >
        40
      </span>
      {kind === "default" && (
        <span className="flex gap-0.5">
          <span className="size-2 rounded-sm bg-black/50" />
          <span className="size-2 rounded-sm bg-black/50" />
          <span className="size-2 rounded-sm bg-black/50" />
        </span>
      )}
    </span>
  );
}
