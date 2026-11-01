"use client";
import { cn } from "@/lib/ui/cn";

export interface ChipOption<T extends string | number> {
  value: T;
  label?: string;
  locked?: boolean;
  disabled?: boolean;
}

interface Props<T extends string | number> {
  options: ChipOption<T>[];
  value: T | null;
  onChange: (value: T) => void;
  label: string;
  testId?: string;
}

/** Row of round chips, as in LifeTap's Players / Starting life rows. */
export function ChipRow<T extends string | number>({
  options,
  value,
  onChange,
  label,
  testId,
}: Props<T>) {
  return (
    <div
      role="radiogroup"
      aria-label={label}
      data-testid={testId}
      className="flex flex-wrap items-center gap-2 rounded-full bg-surface p-1.5"
    >
      {options.map((o) => {
        const selected = o.value === value;
        return (
          <button
            key={String(o.value)}
            type="button"
            role="radio"
            aria-checked={selected}
            disabled={o.disabled}
            data-testid={testId ? `${testId}-${o.value}` : undefined}
            onClick={() => onChange(o.value)}
            className={cn(
              "relative inline-flex size-12 items-center justify-center rounded-full text-base tabular transition",
              "focus-visible:outline-2 focus-visible:outline-accent disabled:opacity-40",
              selected ? "bg-surface-2 ring-2 ring-accent" : "bg-surface-2/70 hover:bg-surface-3",
            )}
          >
            {o.label ?? o.value}
            {o.locked && (
              <span aria-hidden className="absolute -right-0.5 -top-0.5 text-[10px]">
                🔒
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}
