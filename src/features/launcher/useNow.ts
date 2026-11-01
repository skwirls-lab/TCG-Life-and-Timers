"use client";
import { useSyncExternalStore } from "react";

let now = 0;
const listeners = new Set<() => void>();
let timer: ReturnType<typeof setInterval> | null = null;

function subscribe(cb: () => void): () => void {
  listeners.add(cb);
  if (!timer) {
    now = Date.now();
    timer = setInterval(() => {
      now = Date.now();
      for (const l of listeners) l();
    }, 15_000);
  }
  return () => {
    listeners.delete(cb);
    if (listeners.size === 0 && timer) {
      clearInterval(timer);
      timer = null;
    }
  };
}

function snapshot(): number {
  if (now === 0) now = Date.now();
  return now;
}

/** Wall clock refreshed every 15 s (for elapsed labels). 0 during SSR. */
export function useNow(): number {
  return useSyncExternalStore(subscribe, snapshot, () => 0);
}
