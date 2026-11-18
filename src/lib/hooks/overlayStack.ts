/**
 * Overlay stack for Back-button handling (SEAT-005, D-043).
 *
 * Every open overlay (sheet, dialog, paywall…) owns one history entry, pushed when it opens, so
 * Android/browser Back closes the TOP overlay only. Entries are kept in a stack that mirrors the
 * history entries:
 * - `push(close)` adds an entry and pushes `{ overlay: id }` onto history.
 * - `release(id)` (programmatic close / unmount) marks the entry closed. Closed entries at the top
 *   of the stack are trimmed on the next task with ONE `history.go(-k)`. Deferring the trim means
 *   an overlay opened in the same tick (close A → open B) stacks above A's entry instead of being
 *   closed by A's history.back(); A's entry is then trimmed together with B's later. A closed entry
 *   below an open one (e.g. the seat menu closed under the paywall) stays until the top closes.
 * - A popstate we caused (trim) is ignored. Any other popstate is the user going Back: entries
 *   above the entry we landed on are popped and their overlays closed. If only already-closed
 *   entries were popped, the top open overlay closes instead (one Back = one visible close).
 * - When the page navigated meanwhile (the current history entry isn't our top entry), trimmed
 *   entries are dropped without going back, so closing an overlay never undoes a navigation.
 */

export interface OverlayHistory {
  readonly state: unknown;
  pushState(data: unknown, unused: string): void;
  go(delta: number): void;
}

export interface OverlayEnv {
  history: OverlayHistory;
  addPopListener(fn: (state: unknown) => void): () => void;
  defer(fn: () => void): void;
}

interface Entry {
  id: string;
  close: () => void;
  open: boolean;
}

export interface OverlayStack {
  push(close: () => void): string;
  release(id: string): void;
  /**
   * Drop an entry whose history entry the page is about to replace or leave (MENU: a page opened
   * from the center menu): no close callback and no history traversal, ever. The caller removes
   * the `{ overlay: id }` mark from the current history entry.
   */
  forget(id: string): void;
  /** Ids from bottom to top, with open flags (tests/diagnostics). */
  snapshot(): { id: string; open: boolean }[];
}

const overlayIdOf = (state: unknown): string | undefined => {
  if (state && typeof state === "object" && "overlay" in state) {
    const v = (state as { overlay: unknown }).overlay;
    return typeof v === "string" ? v : undefined;
  }
  return undefined;
};

export function createOverlayStack(env: OverlayEnv): OverlayStack {
  const stack: Entry[] = [];
  const prefix = Math.random().toString(36).slice(2, 8);
  let seq = 0;
  /** popstate events caused by our own trims. */
  let expected = 0;
  let trimScheduled = false;
  let unlisten: (() => void) | null = null;

  const listen = () => {
    unlisten ??= env.addPopListener(onPop);
  };
  const maybeUnlisten = () => {
    if (stack.length === 0 && expected === 0 && unlisten) {
      unlisten();
      unlisten = null;
    }
  };

  function trim(): void {
    trimScheduled = false;
    let k = 0;
    while (k < stack.length && !stack[stack.length - 1 - k]!.open) k++;
    if (k === 0) return;
    const topId = stack[stack.length - 1]!.id;
    stack.splice(stack.length - k, k);
    if (overlayIdOf(env.history.state) === topId) {
      expected++;
      env.history.go(-k);
    }
    maybeUnlisten();
  }

  function scheduleTrim(): void {
    if (trimScheduled) return;
    trimScheduled = true;
    env.defer(trim);
  }

  function closeEntry(e: Entry): void {
    e.open = false;
    e.close();
  }

  function onPop(state: unknown): void {
    if (expected > 0) {
      expected--;
      maybeUnlisten();
      return;
    }
    if (stack.length === 0) return;
    const landed = overlayIdOf(state);
    const idx = landed === undefined ? -1 : stack.findIndex((e) => e.id === landed);
    const popped = stack.splice(idx + 1);
    const openPopped = popped.filter((e) => e.open);
    for (const e of openPopped.reverse()) closeEntry(e);
    if (openPopped.length === 0) {
      const top = [...stack].reverse().find((e) => e.open);
      if (top) closeEntry(top);
    }
    if (stack.length > 0 && !stack[stack.length - 1]!.open) scheduleTrim();
    maybeUnlisten();
  }

  return {
    push(close) {
      listen();
      const id = `${prefix}-${++seq}`;
      stack.push({ id, close, open: true });
      env.history.pushState({ overlay: id }, "");
      return id;
    },
    release(id) {
      const e = stack.find((x) => x.id === id);
      if (!e || !e.open) return;
      e.open = false;
      scheduleTrim();
    },
    forget(id) {
      const i = stack.findIndex((x) => x.id === id);
      if (i < 0) return;
      stack.splice(i, 1);
      maybeUnlisten();
    },
    snapshot: () => stack.map((e) => ({ id: e.id, open: e.open })),
  };
}

let shared: OverlayStack | null = null;

/** The page-wide stack (browser history + popstate). */
export function overlayStack(): OverlayStack {
  shared ??= createOverlayStack({
    history: window.history,
    addPopListener: (fn) => {
      const h = (ev: PopStateEvent) => fn(ev.state);
      window.addEventListener("popstate", h);
      return () => window.removeEventListener("popstate", h);
    },
    defer: (fn) => {
      setTimeout(fn, 0);
    },
  });
  return shared;
}
