"use client";
/**
 * Dev/e2e harness (not user-facing; i18n check skips /dev/): picker mode, or a quick-start game
 * table with test ids `harness-{inc|dec|set|reset}-{seatIndex|g}-{counterId}`,
 * `harness-value-{seatIndex|g}-{counterId}`, `harness-calc-{seatIndex}`, `harness-status`,
 * `harness-winner` (winning seat indexes, comma-separated).
 */
import { useEffect, useState } from "react";
import {
  counterValue,
  enabledCounters,
  globalValue,
  startValue,
  tokenHolder,
  type CounterDefinition,
  type Game,
  type Rotation,
} from "@/engine";
import { CalculatorSheet } from "@/features/calculator";
import { PresetPicker } from "@/features/preset-picker";
import { useDispatch, useGameStore } from "@/state/gameStore";
import { applyTestHooks } from "@/state/testHooks";

const ROTATIONS: Rotation[] = [0, 90, 180, 270];
const btn = "min-h-12 min-w-12 rounded-lg bg-surface-2 px-2 text-fg";

export function PresetsHarness({ query }: { query: string }) {
  const params = new URLSearchParams(query);
  const quick = params.get("quick");
  const [picked, setPicked] = useState<string | undefined>(params.get("value") ?? undefined);

  useEffect(() => {
    applyTestHooks(new URLSearchParams(query));
  }, [query]);

  if (!quick) {
    return (
      <main className="mx-auto max-w-2xl p-3" data-testid="presets-harness">
        <h1 className="mb-2 text-xl">Preset picker harness</h1>
        <p data-testid="harness-picked">{picked ?? ""}</p>
        <PresetPicker value={picked} onChange={(id) => setPicked(id)} />
      </main>
    );
  }
  const rot = Number(params.get("rot") ?? 0) as Rotation;
  return <GameTable rotation={ROTATIONS.includes(rot) ? rot : 0} />;
}

function GameTable({ rotation }: { rotation: Rotation }) {
  const game = useGameStore((s) => s.session?.game);
  const dispatch = useDispatch();
  const [amount, setAmount] = useState("0");
  const [calcSeat, setCalcSeat] = useState<string | null>(null);
  if (!game) return <main data-testid="harness-loading">Loading…</main>;

  const defs = enabledCounters(game).filter((d) => d.scope === "player" || d.scope === "global");
  const tokens = enabledCounters(game).filter((d) => d.scope === "token");
  const winners = (game.result?.winners ?? [])
    .map((id) => game.seats.findIndex((s) => s.id === id))
    .join(",");

  return (
    <main className="flex flex-col gap-3 p-3" data-testid="presets-harness">
      <h1 className="text-xl">{game.preset.name}</h1>
      <div className="flex flex-wrap items-center gap-2">
        <span>
          Status: <b data-testid="harness-status">{game.status}</b>
        </span>
        <span>
          Winner: <b data-testid="harness-winner">{winners}</b>
        </span>
        <label className="flex items-center gap-1">
          Amount
          <input
            className="min-h-12 w-24 rounded-lg bg-surface-2 px-2"
            type="number"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            data-testid="harness-amount"
          />
        </label>
        <button
          type="button"
          className={btn}
          data-testid="harness-start"
          onClick={() => dispatch({ type: "START_GAME" })}
        >
          Start
        </button>
        <button
          type="button"
          className={btn}
          data-testid="harness-pass"
          onClick={() => dispatch({ type: "PASS_TURN" })}
        >
          Pass turn
        </button>
      </div>
      {game.seats.map((seat, i) => (
        <section
          key={seat.id}
          aria-label={seat.name}
          className="rounded-xl bg-surface p-2"
          data-testid={`harness-seat-${i}`}
          data-eliminated={String(seat.eliminated)}
        >
          <div className="flex items-center gap-2">
            <h2 className="flex-1 text-lg">{seat.name}</h2>
            {tokens.map((tk) => (
              <button
                key={tk.id}
                type="button"
                className={btn}
                aria-pressed={tokenHolder(game, tk.id) === seat.id}
                data-testid={`harness-token-${i}-${tk.id}`}
                onClick={() => dispatch({ type: "TOKEN_GIVE", counterId: tk.id, seatId: seat.id })}
              >
                {tk.name}
              </button>
            ))}
            <button
              type="button"
              className={btn}
              data-testid={`harness-calc-${i}`}
              onClick={() => setCalcSeat(seat.id)}
            >
              Calculator
            </button>
          </div>
          {defs
            .filter((d) => d.scope === "player")
            .map((d) => (
              <CounterRow
                key={d.id}
                game={game}
                def={d}
                seatId={seat.id}
                slot={String(i)}
                amount={amount}
              />
            ))}
        </section>
      ))}
      {defs.some((d) => d.scope === "global") && (
        <section aria-label="Global" className="rounded-xl bg-surface p-2">
          {defs
            .filter((d) => d.scope === "global")
            .map((d) => (
              <CounterRow key={d.id} game={game} def={d} slot="g" amount={amount} />
            ))}
        </section>
      )}
      {calcSeat && (
        <CalculatorSheet
          seatId={calcSeat}
          open
          onClose={() => setCalcSeat(null)}
          rotation={rotation}
        />
      )}
    </main>
  );
}

function CounterRow({
  game,
  def,
  seatId,
  slot,
  amount,
}: {
  game: Game;
  def: CounterDefinition;
  seatId?: string;
  slot: string;
  amount: string;
}) {
  const dispatch = useDispatch();
  const v = seatId ? counterValue(game, def.id, seatId) : globalValue(game, def.id);
  const id = `${slot}-${def.id}`;
  const add = (sign: 1 | -1) => {
    if (def.kind === "boolean")
      return dispatch({ type: "BOOL_TOGGLE", counterId: def.id, seatId, value: sign === 1 });
    if (def.kind === "enum") return dispatch({ type: "ENUM_NEXT", counterId: def.id, seatId });
    dispatch({ type: "COUNTER_ADD", counterId: def.id, seatId, delta: sign * def.step });
  };
  const set = (value: number) => {
    if (def.kind === "number") dispatch({ type: "COUNTER_SET", counterId: def.id, seatId, value });
    else if (def.kind === "boolean")
      dispatch({ type: "BOOL_TOGGLE", counterId: def.id, seatId, value: value !== 0 });
    else dispatch({ type: "ENUM_SET", counterId: def.id, seatId, index: value });
  };
  return (
    <div className="flex items-center gap-2 py-1" data-testid={`harness-row-${id}`}>
      <span className="flex-1">{def.name}</span>
      <span className="min-w-12 text-right text-xl tabular" data-testid={`harness-value-${id}`}>
        {v}
      </span>
      <button
        type="button"
        className={btn}
        data-testid={`harness-dec-${id}`}
        onClick={() => add(-1)}
      >
        −
      </button>
      <button
        type="button"
        className={btn}
        data-testid={`harness-inc-${id}`}
        onClick={() => add(1)}
      >
        +
      </button>
      <button
        type="button"
        className={btn}
        data-testid={`harness-set-${id}`}
        onClick={() => set(Number(amount))}
      >
        Set
      </button>
      <button
        type="button"
        className={btn}
        data-testid={`harness-reset-${id}`}
        onClick={() => set(startValue(game, def, seatId))}
      >
        Reset
      </button>
    </div>
  );
}
