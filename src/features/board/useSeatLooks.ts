"use client";
import { useMemo } from "react";
import type { ArtRef } from "@/engine";
import { useGameValue } from "@/state/gameStore";

export interface SeatLook {
  id: string;
  name: string;
  color: string;
  art?: ArtRef;
}

/**
 * Names/colours/art of every seat (for mini-grid cells). Selected as primitive strings so the
 * hook only re-renders when a seat's appearance changes, never on counter changes (PERF-002).
 */
export function useSeatLooks(): SeatLook[] {
  const keys = useGameValue((g) =>
    g.seats.map((s) => JSON.stringify([s.id, s.name, s.color, s.art ?? null])),
  );
  return useMemo(
    () =>
      (keys ?? []).map((k) => {
        const [id, name, color, art] = JSON.parse(k) as [string, string, string, ArtRef | null];
        return art ? { id, name, color, art } : { id, name, color };
      }),
    [keys],
  );
}
