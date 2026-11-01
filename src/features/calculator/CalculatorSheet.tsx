"use client";
/**
 * LP calculator sheet (INP-007, TOOL-006): rotated to face the seat, Keypad in calc mode
 * (−value / +value / =value / ½ halve rounding up) and a tape of the seat's recent arithmetic.
 */
import { useState } from "react";
import { counterValue, primaryCounter, type Rotation } from "@/engine";
import { Keypad, Sheet, type KeypadResult } from "@/components/ui";
import { t } from "@/lib/i18n";
import { useDispatch, useGameStore, useGameValue } from "@/state/gameStore";
import { applyCalc, calcTape, rememberCalc, tapeText } from "./calc";

export interface CalculatorSheetProps {
  seatId: string;
  /** Defaults to the preset's primary counter. */
  counterId?: string;
  open: boolean;
  onClose: () => void;
  rotation?: Rotation;
}

export function CalculatorSheet({
  seatId,
  counterId,
  open,
  onClose,
  rotation,
}: CalculatorSheetProps) {
  const dispatch = useDispatch();
  const [entry, setEntry] = useState(0);
  const view = useGameValue((g) => {
    const def = counterId
      ? g.preset.counters.find((c) => c.id === counterId)
      : primaryCounter(g.preset);
    const seat = g.seats.find((s) => s.id === seatId);
    if (!def || !seat) return null;
    return {
      gameId: g.id,
      counterId: def.id,
      counterName: def.name,
      min: def.min,
      max: def.max,
      seatName: seat.name,
      value: counterValue(g, def.id, seatId),
    };
  });
  const game = useGameStore((s) => s.session?.game);
  if (!open || !view || !game) return null;
  const tape = calcTape(game, seatId, view.counterId);

  const submit = (r: KeypadResult) => {
    const next = applyCalc(view.value, r, { min: view.min, max: view.max });
    const before = useGameStore.getState().session?.game.log.length ?? 0;
    dispatch({ type: "COUNTER_SET", counterId: view.counterId, seatId, value: next });
    const after = useGameStore.getState().session?.game;
    // Threshold events (eliminate, game end) may follow the counter event.
    const ev = after?.log
      .slice(before)
      .find((e) => e.kind === "counter" && e.counterId === view.counterId && e.seatId === seatId);
    if (after && ev) rememberCalc(after.id, ev.id, r);
    setEntry((n) => n + 1);
  };

  return (
    <Sheet
      open={open}
      onClose={onClose}
      rotation={rotation}
      title={t("presets.calc.title", { name: view.seatName, counter: view.counterName })}
      testId="calc-sheet"
    >
      <div className="flex flex-col gap-3">
        <p className="text-center text-sm text-fg-muted">{t("presets.calc.hint")}</p>
        <output
          className="block text-center text-5xl font-semibold tabular"
          aria-label={t("presets.calc.current", { counter: view.counterName })}
          data-testid="calc-value"
        >
          {view.value}
        </output>
        <Keypad
          key={entry}
          mode="calc"
          onSubmit={submit}
          testId="calc-keypad"
          submitLabel={t("presets.calc.apply")}
        />
        <section aria-label={t("presets.calc.tape")} className="rounded-xl bg-bg p-3">
          <h3 className="mb-1 text-sm text-fg-muted">{t("presets.calc.tape")}</h3>
          {tape.length === 0 ? (
            <p className="text-sm text-fg-muted" data-testid="calc-tape-empty">
              {t("presets.calc.tapeEmpty")}
            </p>
          ) : (
            <ol className="flex flex-col gap-1 font-mono tabular" data-testid="calc-tape">
              {tape.map((row) => (
                <li key={row.eventId} data-testid="calc-tape-row" data-op={row.op}>
                  {tapeText(row)}
                </li>
              ))}
            </ol>
          )}
        </section>
      </div>
    </Sheet>
  );
}
