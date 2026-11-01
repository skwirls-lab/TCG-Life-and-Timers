"use client";
import { cn } from "@/lib/ui/cn";

interface Props {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label: string;
  disabled?: boolean;
  testId?: string;
}

/** Accessible switch (role="switch"), LifeTap-style pill. */
export function Toggle({ checked, onChange, label, disabled, testId }: Props) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      data-testid={testId}
      onClick={() => onChange(!checked)}
      className={cn(
        "relative inline-flex h-12 w-[4.5rem] shrink-0 items-center rounded-full transition",
        "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:opacity-40",
      )}
    >
      <span
        className={cn(
          "absolute inset-x-1 h-8 rounded-full transition",
          checked ? "bg-accent" : "bg-surface-3",
        )}
      />
      <span
        className={cn(
          "absolute size-7 rounded-full shadow transition-transform",
          checked ? "translate-x-[2.4rem] bg-black" : "translate-x-[0.6rem] bg-fg-muted",
        )}
      />
    </button>
  );
}
