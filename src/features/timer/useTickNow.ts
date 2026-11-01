"use client";
/**
 * Shared 4 Hz wall clock for the small ticking timer labels (response banner, match clock, turn
 * time). One interval for all subscribers; it runs only while something subscribes (§10.2).
 */
import { useSyncExternalStore } from "react";

export const TICK_NOW_MS = 250;

let now = 0;
const listeners = new Set<() => void>();
let timer: ReturnType<typeof setInterval> | null = null;

function subscribe(cb: () => void): () => void {
  listeners.add(cb);
  now = Date.now();
  if (!timer) {
    timer = setInterval(() => {
      now = Date.now();
      for (const l of listeners) l();
    }, TICK_NOW_MS);
  }
  return () => {
    listeners.delete(cb);
    if (listeners.size === 0 && timer) {
      clearInterval(timer);
      timer = null;
    }
  };
}

const idle = () => () => {};

function snapshot(): number {
  if (now === 0) now = Date.now();
  return now;
}

/** Wall clock that re-renders every 250 ms while `active` (otherwise the last value). */
export function useTickNow(active: boolean): number {
  return useSyncExternalStore(active ? subscribe : idle, snapshot, () => 0);
}
