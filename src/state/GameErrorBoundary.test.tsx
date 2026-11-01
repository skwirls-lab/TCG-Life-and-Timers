// @req REL-004 @req REL-005
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { Dexie } from "dexie";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { counterValue, seededRng } from "@/engine";
import { TcgDb } from "@/lib/db";
import { t } from "@/lib/i18n";
import { testPreset } from "../../tests/unit/helpers/engine";
import { GameErrorBoundary } from "./GameErrorBoundary";
import {
  configureGameStore,
  flushAutosave,
  resetGameStore,
  useGameStore,
  useSeat,
} from "./gameStore";

const { captureError } = vi.hoisted(() => ({ captureError: vi.fn() }));
vi.mock("@/lib/errors", () => ({ captureError }));

let db: TcgDb;
let explode = false;

function Life() {
  const life = useSeat("s1", (_seat, game) => counterValue(game, "life", "s1"));
  if (explode) throw new Error("render boom");
  return <p data-testid="life">{String(life)}</p>;
}

beforeEach(() => {
  db = new TcgDb(`boundary-${Math.random()}`);
  configureGameStore({ now: () => 5000, rng: seededRng(1), db: () => db, autosaveMs: 10 });
  explode = false;
});

afterEach(async () => {
  resetGameStore();
  db.close();
  await Dexie.delete(db.name);
});

describe("GameErrorBoundary", () => {
  it("shows Recover game on a render error and restores the saved state", async () => {
    useGameStore.getState().newGame({ preset: testPreset(), players: 2 });
    useGameStore
      .getState()
      .dispatch({ type: "COUNTER_ADD", counterId: "life", seatId: "s1", delta: -6 });
    await flushAutosave();
    // in-memory state drifts (e.g. bad action), then rendering crashes
    useGameStore.setState({ session: null });
    explode = true;
    const err = console.error;
    console.error = () => {};
    let recovered = 0;
    try {
      render(
        <GameErrorBoundary onRecovered={() => recovered++}>
          <Life />
        </GameErrorBoundary>,
      );
    } finally {
      console.error = err;
    }
    expect(screen.getByRole("alert")).toHaveTextContent(t("engine.recover.title"));
    // REL-005: the boundary hands the error + component stack to the (consent-gated) reporter.
    expect(captureError).toHaveBeenCalledWith(expect.objectContaining({ message: "render boom" }), {
      componentStack: expect.any(String),
    });
    explode = false;
    fireEvent.click(screen.getByRole("button", { name: t("engine.recover.button") }));
    await waitFor(() => expect(screen.getByTestId("life")).toHaveTextContent("14"));
    expect(recovered).toBe(1);
  });

  it("reports when nothing can be recovered", async () => {
    explode = true;
    const err = console.error;
    console.error = () => {};
    try {
      render(
        <GameErrorBoundary>
          <Life />
        </GameErrorBoundary>,
      );
      fireEvent.click(screen.getByRole("button", { name: t("engine.recover.button") }));
      await waitFor(() => expect(screen.getByText(t("engine.recover.failed"))).toBeInTheDocument());
      // a throwing resume is also handled
      configureGameStore({
        db: () => {
          throw new Error("idb gone");
        },
      });
      fireEvent.click(screen.getByRole("button", { name: t("engine.recover.button") }));
      await waitFor(() => expect(screen.getByText(t("engine.recover.failed"))).toBeInTheDocument());
    } finally {
      console.error = err;
    }
  });
});
