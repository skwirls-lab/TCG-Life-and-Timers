// @req SEAT-005
import { act, render } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { useBackClose } from "./useBackClose";

function Probe({ open, onClose }: { open: boolean; onClose: () => void }) {
  useBackClose(open, onClose);
  return null;
}

describe("useBackClose", () => {
  it("pushes a history entry while open and closes on popstate", () => {
    const onClose = vi.fn();
    const before = window.history.length;
    render(<Probe open onClose={onClose} />);
    expect(window.history.length).toBe(before + 1);
    act(() => {
      window.dispatchEvent(new PopStateEvent("popstate"));
    });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("goes back when closed programmatically", () => {
    const back = vi.spyOn(window.history, "back").mockImplementation(() => {});
    const { rerender } = render(<Probe open onClose={() => {}} />);
    rerender(<Probe open={false} onClose={() => {}} />);
    expect(back).toHaveBeenCalled();
    back.mockRestore();
  });

  it("does nothing when never opened", () => {
    const before = window.history.length;
    render(<Probe open={false} onClose={() => {}} />);
    expect(window.history.length).toBe(before);
  });
});
