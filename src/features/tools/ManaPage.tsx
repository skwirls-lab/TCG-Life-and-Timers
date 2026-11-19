"use client";
/**
 * TOOL-011 Mana & Storm page (LifeTap "Mana Counter"): W U B R G C rows (− / symbol / value / +),
 * a Storm row, Clear and Close. The pool is device-level (Dexie kv `tools.mana`). When the active
 * game's preset has a global storm counter, the Storm row edits that counter instead, so the
 * engine resets it when the turn passes.
 */
import { useUpNavigation } from "@/lib/nav/useUpNavigation";
import type { ReactNode } from "react";
import { CloudLightning } from "lucide-react";
import { useShallow } from "zustand/react/shallow";
import { Button, PageShell } from "@/components/ui";
import { globalValue } from "@/engine";
import { t, type MessageKey } from "@/lib/i18n";
import { useDispatch, useGameStore } from "@/state/gameStore";
import { CounterRow } from "./CounterRow";
import { MANA_COLORS, ManaGlyph } from "./DieIcon";
import { useGameBootstrap, useKvValue } from "./hooks";
import {
  MANA_KEY,
  MANA_MAX,
  ManaStateSchema,
  bump,
  emptyMana,
  findStormCounter,
  type ManaField,
} from "./mana";

const FALLBACK = emptyMana();

function Row({
  field,
  name,
  icon,
  value,
  onDelta,
}: {
  field: string;
  name: string;
  icon: ReactNode;
  value: number;
  onDelta: (d: number) => void;
}) {
  return (
    <CounterRow
      name={name}
      label={
        <>
          {icon}
          <span className="sr-only">{name}</span>
        </>
      }
      value={value}
      onDelta={onDelta}
      min={0}
      max={MANA_MAX}
      rowTestId={`mana-row-${field}`}
      testIdBase={`mana-${field}`}
    />
  );
}

export function ManaPage() {
  useGameBootstrap();
  const up = useUpNavigation();
  const dispatch = useDispatch();
  const mana = useKvValue(MANA_KEY, FALLBACK, ManaStateSchema);
  const storm = useGameStore(
    useShallow((s) => {
      const game = s.session?.game;
      const def = game ? findStormCounter(game) : undefined;
      if (!game || !def) return null;
      return {
        id: def.id,
        enabled: game.enabledCounters.includes(def.id),
        value: globalValue(game, def.id),
      };
    }),
  );

  const changeStorm = (delta: number) => {
    if (!storm) return mana.set((m) => bump(m, "storm", delta));
    if (!storm.enabled) dispatch({ type: "COUNTER_ENABLE", counterId: storm.id, enabled: true });
    dispatch({ type: "COUNTER_ADD", counterId: storm.id, delta });
  };
  const clear = () => {
    mana.set(emptyMana());
    if (storm && storm.value !== 0)
      dispatch({ type: "COUNTER_SET", counterId: storm.id, value: 0 });
  };
  const stormValue = storm ? storm.value : mana.value.storm;

  return (
    <PageShell title={t("tools.mana.title")} backHref="/tools" testId="mana-page">
      <div
        data-testid="mana-root"
        data-loaded={mana.loaded ? "true" : "false"}
        data-saved={mana.saved ? "true" : "false"}
        data-storm-source={storm ? "game" : "device"}
      >
        <ul className="mt-4 flex flex-col gap-2">
          {MANA_COLORS.map((c) => (
            <Row
              key={c}
              field={c}
              name={t(`tools.mana.${c}` as MessageKey)}
              icon={<ManaGlyph color={c} />}
              value={mana.value[c]}
              onDelta={(d) => mana.set((m) => bump(m, c as ManaField, d))}
            />
          ))}
        </ul>
        <ul className="mt-4">
          <Row
            field="storm"
            name={storm ? t("tools.mana.stormGame") : t("tools.mana.storm")}
            icon={<CloudLightning size={40} aria-hidden className="text-accent" />}
            value={stormValue}
            onDelta={changeStorm}
          />
        </ul>
        <p className="mt-3 text-sm text-fg-muted">
          {storm ? t("tools.mana.stormGame") : t("tools.mana.note")}
        </p>
        <div className="mt-6 grid grid-cols-2 gap-3">
          <Button variant="danger" size="lg" onClick={clear} data-testid="mana-clear">
            {t("tools.mana.clear")}
          </Button>
          <Button size="lg" data-testid="mana-close" onClick={up}>
            {t("tools.mana.close")}
          </Button>
        </div>
      </div>
    </PageShell>
  );
}
