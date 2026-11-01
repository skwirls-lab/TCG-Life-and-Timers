"use client";
/** Dev/test harness for the game-flow overlays (test builds only). Not user-facing copy. */
import { Button } from "@/components/ui";
import { counterValue, primaryCounter } from "@/engine";
import { usePageBoot } from "@/features/app-effects/usePageBoot";
import { GameFlowOverlays } from "@/features/game-flow/GameFlowOverlays";
import { useDispatch, useGameStore } from "@/state/gameStore";

export function GameFlowHarness() {
  usePageBoot();
  const game = useGameStore((s) => s.session?.game);
  const dispatch = useDispatch();
  if (!game) {
    return (
      <main className="p-4" data-testid="harness">
        <p data-testid="harness-empty">No game</p>
      </main>
    );
  }
  const primary = primaryCounter(game.preset);
  return (
    <main className="flex flex-col gap-3 p-4" data-testid="harness">
      <h1 className="text-xl">Game flow harness</h1>
      <p data-testid="harness-status">{game.status}</p>
      <div className="flex flex-wrap gap-2">
        <Button data-testid="harness-reset" onClick={() => dispatch({ type: "RESET_GAME" })}>
          Reset
        </Button>
        <Button data-testid="harness-undo" onClick={() => dispatch({ type: "UNDO" })}>
          Undo
        </Button>
        <Button
          data-testid="harness-autoko-prompt"
          onClick={() => dispatch({ type: "SET_OPTION", key: "autoKO", value: "prompt" })}
        >
          Auto-KO: ask
        </Button>
        <Button
          data-testid="harness-choose"
          onClick={() => dispatch({ type: "SET_OPTION", key: "firstPlayerRule", value: "choose" })}
        >
          First player: choose
        </Button>
      </div>
      <ul className="flex flex-col gap-2">
        {game.seats.map((s, i) => (
          <li
            key={s.id}
            className="flex flex-wrap items-center gap-2"
            data-testid={`harness-seat-${i}`}
          >
            <span className="w-24 truncate">{s.name}</span>
            <span data-testid={`harness-life-${i}`} className="w-12 tabular">
              {counterValue(game, primary.id, s.id)}
            </span>
            <span>{s.eliminated ? "KO" : ""}</span>
            <Button
              size="sm"
              data-testid={`harness-eliminate-${i}`}
              onClick={() => dispatch({ type: "ELIMINATE", seatId: s.id })}
            >
              KO
            </Button>
            <Button
              size="sm"
              data-testid={`harness-zero-${i}`}
              onClick={() =>
                dispatch({ type: "COUNTER_SET", counterId: primary.id, seatId: s.id, value: 0 })
              }
            >
              Life 0
            </Button>
            <Button
              size="sm"
              data-testid={`harness-minus-${i}`}
              onClick={() =>
                dispatch({ type: "COUNTER_ADD", counterId: primary.id, seatId: s.id, delta: -1 })
              }
            >
              -1
            </Button>
          </li>
        ))}
      </ul>
      <GameFlowOverlays />
    </main>
  );
}
