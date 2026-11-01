/**
 * A11Y-001 live announcer core: per-key debounced + throttled messages for one polite live
 * region. Consecutive changes on the same seat are batched (only the latest text is spoken, once
 * the seat has been quiet for `quietMs`), and a seat is never announced more often than every
 * `minIntervalMs`. Immediate messages (turn passes, timeouts) bypass the batching.
 */

export interface AnnouncerOptions {
  emit: (text: string) => void;
  /** Quiet period before a batched message is spoken (ms). */
  quietMs?: number;
  /** Minimum time between two messages for the same key (ms). */
  minIntervalMs?: number;
  now?: () => number;
  setTimer?: (fn: () => void, ms: number) => unknown;
  clearTimer?: (handle: unknown) => void;
}

export interface Announcer {
  /** Batched message for a key (a seat): replaces any pending text for that key. */
  update: (key: string, text: string) => void;
  /** Speak now (turn pass, timeout). */
  say: (text: string) => void;
  /** Drop every pending message (new game, unmount). */
  reset: () => void;
}

export const ANNOUNCE_QUIET_MS = 1000;
export const ANNOUNCE_MIN_INTERVAL_MS = 1000;

export function createAnnouncer({
  emit,
  quietMs = ANNOUNCE_QUIET_MS,
  minIntervalMs = ANNOUNCE_MIN_INTERVAL_MS,
  now = () => Date.now(),
  setTimer = (fn, ms) => setTimeout(fn, ms),
  clearTimer = (h) => clearTimeout(h as ReturnType<typeof setTimeout>),
}: AnnouncerOptions): Announcer {
  const keys = new Map<string, { text: string; timer: unknown; last: number }>();

  const fire = (key: string) => {
    const k = keys.get(key);
    if (!k) return;
    k.timer = null;
    k.last = now();
    emit(k.text);
  };

  return {
    update(key, text) {
      const k = keys.get(key) ?? { text, timer: null, last: -Infinity };
      keys.set(key, k);
      k.text = text;
      if (k.timer !== null) clearTimer(k.timer);
      const t = now();
      const due = Math.max(t + quietMs, k.last + minIntervalMs);
      k.timer = setTimer(() => fire(key), due - t);
    },
    say(text) {
      emit(text);
    },
    reset() {
      for (const k of keys.values()) if (k.timer !== null) clearTimer(k.timer);
      keys.clear();
    },
  };
}
