export interface Debounced<A extends unknown[]> {
  (...args: A): void;
  /** Drop a pending call. */
  cancel(): void;
  /** Run a pending call now. */
  flush(): void;
  readonly pending: boolean;
}

/** Trailing-edge debounce; ART-001 uses 300 ms for autocomplete input. */
export function debounce<A extends unknown[]>(fn: (...args: A) => void, ms = 300): Debounced<A> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  let lastArgs: A | undefined;

  const fire = () => {
    timer = undefined;
    const args = lastArgs!;
    lastArgs = undefined;
    fn(...args);
  };

  const debounced = ((...args: A) => {
    lastArgs = args;
    if (timer !== undefined) clearTimeout(timer);
    timer = setTimeout(fire, ms);
  }) as Debounced<A>;

  debounced.cancel = () => {
    if (timer !== undefined) clearTimeout(timer);
    timer = undefined;
    lastArgs = undefined;
  };
  debounced.flush = () => {
    if (timer === undefined) return;
    clearTimeout(timer);
    fire();
  };
  Object.defineProperty(debounced, "pending", { get: () => timer !== undefined });
  return debounced;
}
