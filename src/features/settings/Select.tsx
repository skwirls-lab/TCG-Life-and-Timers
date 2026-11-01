"use client";
import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/ui/cn";

export interface SelectOption<T extends string> {
  value: T;
  label: string;
  disabled?: boolean;
}

interface Props<T extends string> {
  value: T;
  options: SelectOption<T>[];
  onChange: (v: T) => void;
  label: string;
  disabled?: boolean;
  testId?: string;
  className?: string;
}

/** Dropdown value on the right of a settings row (LifeTap "Starting player: Random"). */
export function Select<T extends string>({
  value,
  options,
  onChange,
  label,
  disabled,
  testId,
  className,
}: Props<T>) {
  return (
    <span className={cn("relative inline-flex", className)}>
      <select
        aria-label={label}
        value={value}
        disabled={disabled}
        data-testid={testId}
        onChange={(e) => onChange(e.target.value as T)}
        className="min-h-12 max-w-[11rem] appearance-none rounded-xl bg-surface-2 py-2 pl-3 pr-9 text-base text-fg focus-visible:outline-2 focus-visible:outline-accent disabled:opacity-40"
      >
        {options.map((o) => (
          <option key={o.value} value={o.value} disabled={o.disabled}>
            {o.label}
          </option>
        ))}
      </select>
      <ChevronDown
        aria-hidden
        size={18}
        className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-fg-muted"
      />
    </span>
  );
}
