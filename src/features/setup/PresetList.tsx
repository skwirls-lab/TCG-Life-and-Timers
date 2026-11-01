"use client";
/**
 * Preset list for setup and settings (PRE-003, CUS-001): the T3.5 `PresetPicker` fed with every
 * visible built-in plus the user's custom presets (`listAllPresets`). Custom presets are grouped
 * under their game name and marked "Custom" by the picker.
 */
import { useEffect, useState } from "react";
import type { Preset } from "@/engine";
import { PresetPicker } from "@/features/preset-picker";
import { listAllPresets } from "@/lib/customPresets";
import { listBuiltInPresets } from "@/presets";

export function groupPresets(presets: readonly Preset[]): { game: string; presets: Preset[] }[] {
  const groups = new Map<string, Preset[]>();
  for (const p of presets) {
    const list = groups.get(p.game) ?? [];
    list.push(p);
    groups.set(p.game, list);
  }
  return [...groups].map(([game, list]) => ({ game, presets: list }));
}

/** Built-ins immediately, then built-ins + custom presets once IndexedDB answers. */
export function useAllPresets(): { presets: readonly Preset[]; loaded: boolean } {
  const [state, setState] = useState<{ presets: readonly Preset[]; loaded: boolean }>(() => ({
    presets: listBuiltInPresets(),
    loaded: false,
  }));
  useEffect(() => {
    let alive = true;
    listAllPresets()
      .then((presets) => alive && setState({ presets, loaded: true }))
      .catch(() => alive && setState((s) => ({ ...s, loaded: true })));
    return () => {
      alive = false;
    };
  }, []);
  return state;
}

interface Props {
  value: string;
  onChange: (preset: Preset) => void;
  /** Accessible name of the list (kept for callers; the picker labels its own sections). */
  label: string;
  testIdPrefix: string;
  /** Push the chosen preset to "Recent" on select (setup records it at Start instead). */
  recordRecent?: boolean;
}

export function PresetList({ value, onChange, label, testIdPrefix, recordRecent = true }: Props) {
  const { presets, loaded } = useAllPresets();
  return (
    <div
      role="group"
      aria-label={label}
      data-testid={testIdPrefix}
      data-all-loaded={String(loaded)}
    >
      <PresetPicker
        value={value}
        presets={presets}
        recordRecent={recordRecent}
        onChange={(_id, p) => onChange(p)}
        testId={`${testIdPrefix}-picker`}
      />
    </div>
  );
}
