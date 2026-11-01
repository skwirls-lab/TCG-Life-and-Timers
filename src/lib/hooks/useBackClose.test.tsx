// @req SEAT-005
import { act, render } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { useBackClose } from "./useBackClose";

function Probe({ open, onClose }: { open: boolean; onClose: () => void }) {
  useBackClose(open, onClose);
  return null;
}

const pop = (state: unknown = null) =>
  act(() => {
    window.dispatchEvent(new PopStateEvent("popstate", { state }));
  });

describe("useBackClose", () => {
  it("pushes a history entry while open and closes on popstate", () => {
    const onClose = vi.fn();
    const before = window.history.length;
    render(<Probe open onClose={onClose} />);
    expect(window.history.length).toBe(before + 1);
    pop();
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("goes back (once the tick ends) when closed programmatically", async () => {
    vi.useFakeTimers();
    const go = vi.spyOn(window.history, "go").mockImplementation(() => {});
    const { rerender } = render(<Probe open onClose={() => {}} />);
    rerender(<Probe open={false} onClose={() => {}} />);
    expect(go).not.toHaveBeenCalled();
    await vi.runAllTimersAsync();
    expect(go).toHaveBeenCalledWith(-1);
    pop(); // our own traversal: ignored
    go.mockRestore();
    vi.useRealTimers();
  });

  it("does nothing when never opened", () => {
    const before = window.history.length;
    render(<Probe open={false} onClose={() => {}} />);
    expect(window.history.length).toBe(before);
  });

  it("stacked overlays: Back closes the top one only; a same-tick swap keeps the new one", async () => {
    vi.useFakeTimers();
    const go = vi.spyOn(window.history, "go").mockImplementation(() => {});
    const menu = vi.fn();
    const paywall = vi.fn();
    const ui = (m: boolean, p: boolean, w = false, who = vi.fn()) => (
      <>
        <Probe open={m} onClose={menu} />
        <Probe open={p} onClose={paywall} />
        <Probe open={w} onClose={who} />
      </>
    );
    const { rerender } = render(ui(true, true));
    const menuState = { ...(window.history.state as object) };
    // Back while the paywall is over the seat menu → only the paywall closes.
    pop({ overlay: overlayBelow(menuState) });
    expect(paywall).toHaveBeenCalledTimes(1);
    expect(menu).not.toHaveBeenCalled();
    // Swap in the same tick: the paywall closes while "who won" opens.
    const who = vi.fn();
    rerender(ui(true, false, true, who));
    await vi.runAllTimersAsync();
    expect(who).not.toHaveBeenCalled();
    expect(menu).not.toHaveBeenCalled();
    rerender(ui(false, false, false, who));
    await vi.runAllTimersAsync();
    go.mockRestore();
    vi.useRealTimers();
  });
});

/** The overlay id of the history entry just below the top one (the seat menu's). */
function overlayBelow(top: object): string {
  const id = (top as { overlay: string }).overlay;
  const [prefix, n] = id.split("-");
  return `${prefix}-${Number(n) - 1}`;
}
