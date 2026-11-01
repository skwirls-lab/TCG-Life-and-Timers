"use client";
import { useCallback, useEffect, useState } from "react";
import { commanderDamageGrid, primaryCounter, counterValue, type Rotation } from "@/engine";
import { artToCss } from "@/features/backgrounds/gradients";
import { SeatMenu, type SeatMenuTab } from "@/features/seat/SeatMenu";
import { useGameStore } from "@/state/gameStore";
import { applyTestHooks } from "@/state/testHooks";

const ROTATIONS: Rotation[] = [0, 90, 180, 270];

/** Minimal board stand-in: seat list with open buttons and live readouts (dev/e2e only). */
export function SeatMenuHarness({ query }: { query: string }) {
  const [openSeat, setOpenSeat] = useState<string | null>(null);
  const params = new URLSearchParams(query);
  const rotParam = Number(params.get("rot") ?? 0) as Rotation;
  const rotation = ROTATIONS.includes(rotParam) ? rotParam : 0;
  const tab = (params.get("tab") ?? undefined) as SeatMenuTab | undefined;
  const focus = params.get("focus") ?? undefined;
  const game = useGameStore((s) => s.session?.game);

  useEffect(() => {
    applyTestHooks(new URLSearchParams(query));
  }, [query]);

  const close = useCallback(() => setOpenSeat(null), []);

  if (!game) return <main data-testid="harness-loading">Loading…</main>;
  const primary = primaryCounter(game.preset);
  return (
    <main className="flex flex-col gap-2 p-3" data-testid="seat-harness">
      {game.seats.map((seat, i) => {
        const cmd = commanderDamageGrid(game, seat.id).reduce((n, c) => n + c.value, 0);
        return (
          <div
            key={seat.id}
            data-testid={`harness-seat-${i}`}
            data-name={seat.name}
            data-color={seat.color}
            data-art-kind={seat.art?.kind ?? "none"}
            data-art-value={seat.art?.value ?? ""}
            data-contrast={String(seat.contrast)}
            data-eliminated={String(seat.eliminated)}
            data-commanders={seat.commanders.join("|")}
            data-profile={seat.profileId ?? ""}
            data-deck={seat.deckName ?? ""}
            data-rotation={String(seat.rotationOverride ?? "")}
            className="flex items-center gap-3 rounded-xl p-2 text-white"
            style={artToCss(seat.art, seat.color)}
          >
            <button
              type="button"
              data-testid={`harness-open-${i}`}
              className="min-h-12 rounded-lg bg-black/70 px-4"
              onClick={() => setOpenSeat(seat.id)}
            >
              {seat.name}
            </button>
            <span className="rounded bg-black/70 px-2 text-2xl" data-testid={`harness-value-${i}`}>
              {counterValue(game, primary.id, seat.id)}
            </span>
            <span className="rounded bg-black/70 px-2" data-testid={`harness-cmd-${i}`}>
              {cmd}
            </span>
          </div>
        );
      })}
      {openSeat && (
        <SeatMenu
          seatId={openSeat}
          open
          onClose={close}
          rotation={rotation}
          initialTab={tab}
          focusCounterId={focus}
        />
      )}
    </main>
  );
}
