"use client";
import { cn } from "@/lib/ui/cn";

interface Props<T extends string> {
  options: { value: T; label: string }[];
  value: T;
  onChange: (v: T) => void;
  label: string;
  testId?: string;
}

/** Two-to-four way segmented control (e.g. Current Game | Past Games). */
export function Segmented<T extends string>({ options, value, onChange, label, testId }: Props<T>) {
  return (
    <div
      role="tablist"
      aria-label={label}
      data-testid={testId}
      className="flex w-full rounded-2xl bg-surface p-1"
    >
      {options.map((o) => (
        <button
          key={o.value}
          role="tab"
          type="button"
          aria-selected={o.value === value}
          data-testid={testId ? `${testId}-${o.value}` : undefined}
          onClick={() => onChange(o.value)}
          className={cn(
            "min-h-12 flex-1 rounded-xl px-3 text-base transition",
            o.value === value ? "bg-surface-3 text-fg" : "text-fg-muted hover:text-fg",
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}
