// @vitest-environment node
// @req SEAT-005
import { describe, expect, it, vi } from "vitest";
import { createOverlayStack, type OverlayEnv } from "./overlayStack";

/** A fake session history: entries + index; go() is async (delivered by flush()). */
function fakeEnv() {
  const entries: unknown[] = [{ page: "/play" }];
  let index = 0;
  const listeners = new Set<(s: unknown) => void>();
  const tasks: (() => void)[] = [];
  const env: OverlayEnv = {
    history: {
      get state() {
        return entries[index];
      },
      pushState(data) {
        entries.splice(index + 1, entries.length, data);
        index = entries.length - 1;
      },
      go(delta) {
        tasks.push(() => {
          index = Math.max(0, Math.min(entries.length - 1, index + delta));
          for (const l of [...listeners]) l(entries[index]);
        });
      },
    },
    addPopListener(fn) {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
    defer(fn) {
      tasks.push(fn);
    },
  };
  /** Run queued tasks (deferred trims, traversals) until idle. */
  const flush = () => {
    for (let guard = 0; tasks.length > 0 && guard < 100; guard++) tasks.shift()!();
  };
  /** The user presses Back. */
  const back = () => {
    env.history.go(-1);
    flush();
  };
  return {
    env,
    flush,
    back,
    get index() {
      return index;
    },
    get listeners() {
      return listeners.size;
    },
    navigate(page: string) {
      env.history.pushState({ page }, "");
    },
  };
}

describe("overlay stack", () => {
  it("forget drops an entry without closing it or moving history (MENU: page from the menu)", () => {
    const h = fakeEnv();
    const s = createOverlayStack(h.env);
    const menu = vi.fn();
    const id = s.push(menu);
    s.forget(id);
    s.forget("unknown");
    s.release(id); // no-op once forgotten
    h.flush();
    expect(s.snapshot()).toEqual([]);
    expect(menu).not.toHaveBeenCalled();
    expect(h.index).toBe(1);
    expect(h.listeners).toBe(0);
    // A later overlay on the next page trims only itself.
    const keypad = s.push(vi.fn());
    s.release(keypad);
    h.flush();
    expect(h.index).toBe(1);
  });

  it("Back closes only the top overlay", () => {
    const h = fakeEnv();
    const s = createOverlayStack(h.env);
    const menu = vi.fn();
    const paywall = vi.fn();
    s.push(menu);
    s.push(paywall);
    expect(h.index).toBe(2);
    h.back();
    expect(paywall).toHaveBeenCalledTimes(1);
    expect(menu).not.toHaveBeenCalled();
    expect(h.index).toBe(1);
    h.back();
    expect(menu).toHaveBeenCalledTimes(1);
    expect(h.index).toBe(0);
    expect(s.snapshot()).toEqual([]);
    expect(h.listeners).toBe(0);
  });

  it("closing the top programmatically goes back once and keeps the one beneath open", () => {
    const h = fakeEnv();
    const s = createOverlayStack(h.env);
    const menu = vi.fn();
    s.push(menu);
    const pw = s.push(() => {});
    s.release(pw);
    h.flush();
    expect(h.index).toBe(1);
    expect(menu).not.toHaveBeenCalled();
    expect(s.snapshot()).toEqual([{ id: expect.any(String), open: true }]);
    // A later Back still closes the menu.
    h.back();
    expect(menu).toHaveBeenCalledTimes(1);
  });

  it("same-tick swap: closing A and opening B keeps B open; both entries trim later", () => {
    const h = fakeEnv();
    const s = createOverlayStack(h.env);
    const a = s.push(() => {});
    const bClose = vi.fn();
    s.release(a);
    const b = s.push(bClose);
    h.flush();
    expect(bClose).not.toHaveBeenCalled();
    expect(s.snapshot().map((e) => e.open)).toEqual([false, true]);
    s.release(b);
    h.flush();
    expect(h.index).toBe(0);
    expect(s.snapshot()).toEqual([]);
  });

  it("Back on a swapped stack closes B and trims A's stale entry", () => {
    const h = fakeEnv();
    const s = createOverlayStack(h.env);
    const a = s.push(() => {});
    s.release(a);
    const bClose = vi.fn();
    s.push(bClose);
    h.flush();
    h.back();
    expect(bClose).toHaveBeenCalledTimes(1);
    expect(h.index).toBe(0);
  });

  it("a closed entry under an open one: Back closes the open one in one press", () => {
    const h = fakeEnv();
    const s = createOverlayStack(h.env);
    const menu = s.push(() => {});
    const pw = vi.fn();
    s.push(pw);
    s.release(menu); // the menu closed underneath the paywall
    h.flush();
    expect(h.index).toBe(2);
    h.back();
    expect(pw).toHaveBeenCalledTimes(1);
    expect(h.index).toBe(0);
  });

  it("Back landing on a closed top entry closes the top open overlay", () => {
    const h = fakeEnv();
    const s = createOverlayStack(h.env);
    const aClose = vi.fn();
    s.push(aClose);
    const b = s.push(() => {});
    const c = s.push(() => {});
    s.release(c);
    // Simulate the user pressing Back before the trim runs: the popped entry (c) was closed.
    s.release(b);
    h.env.history.go(-1);
    h.flush();
    expect(aClose).toHaveBeenCalledTimes(1);
    expect(s.snapshot()).toEqual([]);
  });

  it("does not go back when the page navigated after the overlay opened", () => {
    const h = fakeEnv();
    const s = createOverlayStack(h.env);
    const id = s.push(() => {});
    h.navigate("/settings");
    s.release(id);
    h.flush();
    expect(h.index).toBe(2);
    expect(s.snapshot()).toEqual([]);
  });

  it("popstates with no overlays open, or unknown entries, are ignored / pop everything", () => {
    const h = fakeEnv();
    const s = createOverlayStack(h.env);
    s.release("nope");
    const a = vi.fn();
    s.push(a);
    // A popstate landing on a non-overlay entry pops every overlay.
    h.back();
    expect(a).toHaveBeenCalledTimes(1);
    h.back(); // nothing open: ignored
    expect(s.snapshot()).toEqual([]);
  });
});
