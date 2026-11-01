"use client";
import { cn } from "@/lib/ui/cn";

interface Props<T extends string> {
  tabs: { value: T; label: string }[];
  value: T;
  onChange: (v: T) => void;
  label: string;
  testId?: string;
}

/** Underlined text tabs (e.g. Games · Players · Decks · Insights). */
export function Tabs<T extends string>({ tabs, value, onChange, label, testId }: Props<T>) {
  return (
    <div
      role="tablist"
      aria-label={label}
      data-testid={testId}
      className="flex gap-5 overflow-x-auto"
    >
      {tabs.map((tab) => (
        <button
          key={tab.value}
          role="tab"
          type="button"
          aria-selected={tab.value === value}
          data-testid={testId ? `${testId}-${tab.value}` : undefined}
          onClick={() => onChange(tab.value)}
          className={cn(
            "min-h-12 shrink-0 border-b-2 text-lg transition",
            tab.value === value
              ? "border-fg text-fg"
              : "border-transparent text-fg-subtle hover:text-fg-muted",
          )}
        >
          {tab.label}
        </button>
      ))}
    </div>
  );
}
