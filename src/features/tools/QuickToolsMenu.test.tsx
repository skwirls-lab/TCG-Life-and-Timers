// @req TOOL-010 @req TOOL-009 @req HIST-012
import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { seededRng } from "@/engine";
import { commander } from "@/presets/mtg/presets";
import { configureGameStore, resetGameStore, useGameStore } from "@/state/gameStore";
import { useSettingsStore } from "@/state/settingsStore";
import { QuickToolsMenu } from "./QuickToolsMenu";
import { setToolRng, useToolResult } from "./useToolRunner";

beforeEach(() => {
  configureGameStore({ now: () => 1_000, rng: seededRng(3), autosaveMs: 100_000 });
  useSettingsStore.setState({ hydrated: true });
  setToolRng(seededRng(5));
});

afterEach(() => {
  act(() => useToolResult.getState().dismiss());
  resetGameStore();
  setToolRng();
});

function startGame() {
  act(() => {
    useGameStore.getState().newGame({
      preset: commander,
      seats: ["Conner", "Josh", "JP", "Bethany"].map((name) => ({ name })),
    });
  });
}

describe("QuickToolsMenu", () => {
  it("renders nothing when closed", () => {
    const { container } = render(<QuickToolsMenu open={false} onClose={() => {}} />);
    expect(container).toBeEmptyDOMElement();
  });

  it("tapping d20 shows the overlay, logs the roll, and closes after dismiss", () => {
    startGame();
    const onClose = vi.fn();
    render(<QuickToolsMenu open onClose={onClose} />);
    expect(screen.getByTestId("quick-tools")).toBeInTheDocument();
    fireEvent.click(screen.getByTestId("quick-d20"));
    const v = Number(screen.getByTestId("tool-result-value").textContent);
    expect(v).toBeGreaterThanOrEqual(1);
    expect(v).toBeLessThanOrEqual(20);
    expect(screen.queryByTestId("quick-tools")).toBeNull();
    const log = useGameStore.getState().session!.game.log;
    expect(log.at(-1)).toMatchObject({ kind: "dice", meta: { sides: 20, total: v } });
    fireEvent.click(screen.getByTestId("tool-result-dismiss"));
    expect(onClose).toHaveBeenCalled();
    expect(screen.queryByTestId("tool-result")).toBeNull();
  });

  it("releasing the hold on an item after sliding fires it (Scenario 12)", () => {
    render(<QuickToolsMenu open onClose={() => {}} />);
    const target = screen.getByTestId("quick-d6");
    const spy = vi.fn(() => target);
    Object.defineProperty(document, "elementFromPoint", { value: spy, configurable: true });
    // A release where the hold started is ignored.
    fireEvent.pointerMove(window, { clientX: 100, clientY: 100 });
    fireEvent.pointerUp(window, { clientX: 102, clientY: 101 });
    expect(screen.queryByTestId("tool-result")).toBeNull();
    // Slide onto the item and release.
    fireEvent.pointerUp(window, { clientX: 160, clientY: 40 });
    expect(screen.getByTestId("tool-result")).toHaveAttribute("data-kind", "dice");
    expect(screen.getByText("d6")).toBeInTheDocument();
  });

  it("seat randomizers are disabled without a game; opponent asks who is choosing", () => {
    const { unmount } = render(<QuickToolsMenu open onClose={() => {}} />);
    expect(screen.getByTestId("quick-player")).toBeDisabled();
    expect(screen.getByTestId("quick-opponent")).toBeDisabled();
    unmount();
    startGame();
    render(<QuickToolsMenu open onClose={() => {}} />);
    fireEvent.click(screen.getByTestId("quick-opponent"));
    expect(screen.getByTestId("seat-picker")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "JP" }));
    expect(screen.getByTestId("tool-result")).toHaveAttribute("data-kind", "opponent");
    const ev = useGameStore.getState().session!.game.log.at(-1)!;
    expect(ev.kind).toBe("random");
    const jp = useGameStore.getState().session!.game.seats.find((s) => s.name === "JP")!.id;
    expect(ev.meta?.resultSeatId).not.toBe(jp);
  });

  it("Escape closes the menu", () => {
    const onClose = vi.fn();
    render(<QuickToolsMenu open onClose={onClose} />);
    fireEvent.keyDown(window, { key: "Escape" });
    expect(onClose).toHaveBeenCalled();
  });
});
