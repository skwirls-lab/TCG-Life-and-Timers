"use client";
/** Basic preset picker grouped by game (PRE-003 basic; the full picker is T3.5). */
import { Check } from "lucide-react";
import type { Preset } from "@/engine";
import { listBuiltInPresets } from "@/presets";
import { cn } from "@/lib/ui/cn";

export function groupPresets(presets: readonly Preset[]): { game: string; presets: Preset[] }[] {
  const groups = new Map<string, Preset[]>();
  for (const p of presets) {
    const list = groups.get(p.game) ?? [];
    list.push(p);
    groups.set(p.game, list);
  }
  return [...groups].map(([game, list]) => ({ game, presets: list }));
}

interface Props {
  value: string;
  onChange: (preset: Preset) => void;
  label: string;
  testIdPrefix: string;
}

export function PresetList({ value, onChange, label, testIdPrefix }: Props) {
  const groups = groupPresets(listBuiltInPresets());
  return (
    <div role="radiogroup" aria-label={label} className="flex flex-col gap-4">
      {groups.map((g) => (
        <section key={g.game} aria-label={g.game} className="flex flex-col gap-2">
          <h3 className="text-sm uppercase tracking-wide text-fg-muted">{g.game}</h3>
          {g.presets.map((p) => {
            const selected = p.id === value;
            return (
              <button
                key={p.id}
                type="button"
                role="radio"
                aria-checked={selected}
                data-testid={`${testIdPrefix}-${p.id}`}
                onClick={() => onChange(p)}
                className={cn(
                  "flex min-h-16 w-full items-center gap-3 rounded-2xl px-4 py-3 text-left transition",
                  "focus-visible:outline-2 focus-visible:outline-accent",
                  selected ? "bg-surface-2 ring-2 ring-accent" : "bg-surface hover:bg-surface-2",
                )}
              >
                <span className="flex min-w-0 flex-1 flex-col">
                  <span className="text-lg">{p.name}</span>
                  {p.format && <span className="text-sm text-fg-muted">{p.format}</span>}
                  <span className="line-clamp-2 text-sm text-fg-subtle">{p.rulesSummary}</span>
                </span>
                {selected && <Check aria-hidden className="shrink-0 text-accent" />}
              </button>
            );
          })}
        </section>
      ))}
    </div>
  );
}
