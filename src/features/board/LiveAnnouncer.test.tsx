// @req A11Y-001
import { act, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { seededRng } from "@/engine";
import { configureGameStore, resetGameStore, useGameStore } from "@/state/gameStore";
import { newGame, sessionOf } from "../../../tests/unit/helpers/engine";
import { LiveAnnouncer } from "./LiveAnnouncer";

const add = (seatId: string, delta: number) =>
  act(() =>
    useGameStore.getState().dispatch({ type: "COUNTER_ADD", counterId: "life", seatId, delta }),
  );

beforeEach(() => {
  vi.useFakeTimers();
  configureGameStore({ now: () => Date.now(), rng: seededRng(1) });
  useGameStore.setState({
    session: sessionOf(newGame({ options: { turnTracking: true } })),
  });
});

afterEach(() => {
  vi.useRealTimers();
  resetGameStore();
});

describe("LiveAnnouncer (A11Y-001)", () => {
  it("is one polite status region that batches taps per seat", () => {
    render(<LiveAnnouncer />);
    const region = screen.getByRole("status");
    expect(region).toHaveAttribute("aria-live", "polite");
    expect(region).toHaveTextContent("");
    add("s3", 1);
    add("s3", 1);
    act(() => void vi.advanceTimersByTime(500));
    add("s3", 1);
    act(() => void vi.advanceTimersByTime(900));
    expect(region).toHaveTextContent(""); // still batching (quiet period restarted)
    act(() => void vi.advanceTimersByTime(100));
    expect(region).toHaveTextContent("Conner Life 23");
  });

  it("announces turn passes at once", () => {
    render(<LiveAnnouncer />);
    act(() => useGameStore.getState().dispatch({ type: "PASS_TURN" }));
    act(() => useGameStore.getState().dispatch({ type: "PASS_TURN" }));
    expect(screen.getByRole("status").textContent).toMatch(/'s turn, turn \d/);
  });
});
