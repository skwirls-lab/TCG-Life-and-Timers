import { abortError, throwIfAborted } from "./errors";

export type Sleep = (ms: number, signal?: AbortSignal) => Promise<void>;

/** Abortable `setTimeout` sleep. */
export const defaultSleep: Sleep = (ms, signal) =>
  new Promise<void>((resolve, reject) => {
    if (signal?.aborted) {
      reject(abortError(signal));
      return;
    }
    const onAbort = () => {
      clearTimeout(timer);
      reject(abortError(signal));
    };
    const timer = setTimeout(() => {
      signal?.removeEventListener("abort", onAbort);
      resolve();
    }, ms);
    signal?.addEventListener("abort", onAbort, { once: true });
  });

export interface RequestQueueOptions {
  /** Minimum gap between the start of consecutive tasks (ART-006). Default 100 ms. */
  spacingMs?: number;
  now?: () => number;
  sleep?: Sleep;
}

export interface RequestQueue {
  /** Run `task` once every earlier task has settled and the spacing has elapsed. */
  run<T>(task: () => Promise<T>, signal?: AbortSignal): Promise<T>;
  /** Tasks queued or running. */
  readonly pending: number;
}

/**
 * Serial request queue: at most one task in flight, and consecutive task starts are at
 * least `spacingMs` apart (≤ 10 req/s for the default 100 ms; Scryfall etiquette, ART-006).
 * An aborted task rejects immediately and is skipped without consuming a slot.
 */
export function createRequestQueue(opts: RequestQueueOptions = {}): RequestQueue {
  const spacingMs = opts.spacingMs ?? 100;
  const now = opts.now ?? (() => Date.now());
  const sleep = opts.sleep ?? defaultSleep;
  let tail: Promise<unknown> = Promise.resolve();
  let lastStart = Number.NEGATIVE_INFINITY;
  let pending = 0;

  function run<T>(task: () => Promise<T>, signal?: AbortSignal): Promise<T> {
    if (signal?.aborted) return Promise.reject(abortError(signal));
    pending += 1;
    const turn = tail.then(async () => {
      try {
        throwIfAborted(signal);
        const wait = lastStart + spacingMs - now();
        if (wait > 0) await sleep(wait, signal);
        lastStart = now();
        return await task();
      } finally {
        pending -= 1;
      }
    });
    tail = turn.catch(() => undefined);
    if (!signal) return turn;
    // Reject the caller as soon as it aborts, even while still waiting its turn.
    return new Promise<T>((resolve, reject) => {
      const onAbort = () => reject(abortError(signal));
      signal.addEventListener("abort", onAbort, { once: true });
      turn.then(
        (v) => {
          signal.removeEventListener("abort", onAbort);
          resolve(v);
        },
        (e: unknown) => {
          signal.removeEventListener("abort", onAbort);
          reject(e);
        },
      );
    });
  }

  return {
    run,
    get pending() {
      return pending;
    },
  };
}
