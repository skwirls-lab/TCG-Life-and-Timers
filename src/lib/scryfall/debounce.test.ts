// @vitest-environment node
// @req ART-001
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { debounce } from "./debounce";

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

describe("debounce", () => {
  it("defaults to 300 ms and calls once with the latest args", () => {
    const fn = vi.fn();
    const d = debounce(fn);
    d("s");
    vi.advanceTimersByTime(200);
    d("so");
    vi.advanceTimersByTime(200);
    d("sol");
    expect(d.pending).toBe(true);
    vi.advanceTimersByTime(299);
    expect(fn).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(fn).toHaveBeenCalledTimes(1);
    expect(fn).toHaveBeenCalledWith("sol");
    expect(d.pending).toBe(false);
  });

  it("cancel drops the pending call; flush runs it now", () => {
    const fn = vi.fn();
    const d = debounce(fn, 50);
    d(1);
    d.cancel();
    vi.advanceTimersByTime(100);
    expect(fn).not.toHaveBeenCalled();
    d.cancel(); // no-op when idle
    d(2);
    d.flush();
    expect(fn).toHaveBeenCalledWith(2);
    d.flush(); // no-op when idle
    vi.advanceTimersByTime(100);
    expect(fn).toHaveBeenCalledTimes(1);
  });
});
