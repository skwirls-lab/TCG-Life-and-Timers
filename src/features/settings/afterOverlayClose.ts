"use client";
/**
 * Run `fn` once a Sheet that was just closed has popped its Back-button history entry
 * (useBackClose calls history.back() on close). Opening another Sheet before that popstate
 * arrives would close the new Sheet immediately.
 */
export function afterOverlayClose(fn: () => void, fallbackMs = 400): void {
  if (typeof window === "undefined") return fn();
  let done = false;
  const run = () => {
    if (done) return;
    done = true;
    window.removeEventListener("popstate", onPop);
    clearTimeout(timer);
    fn();
  };
  const onPop = () => setTimeout(run, 0);
  window.addEventListener("popstate", onPop);
  const timer = setTimeout(run, fallbackMs);
}
