"use client";
/**
 * Board-local timer UI state (not persisted): warning flashes per seat (TMR-031) and the
 * TMR-011 "details" peek on the holder's chip.
 */
import { create } from "zustand";
import type { SeatId } from "@/engine";

export type FlashKind = "warning" | "timeout";

interface TimerUiState {
  /** Seat → flash kind + a nonce (re-triggers the CSS animation). */
  flashes: Record<SeatId, { kind: FlashKind; nonce: number }>;
  flash: (seatId: SeatId, kind: FlashKind) => void;
  clearFlash: (seatId: SeatId) => void;
}

let nonce = 0;

/** How long a flash stays (3 × 0.5 s animation). */
export const FLASH_MS = 1600;

export const useTimerUi = create<TimerUiState>((set, get) => ({
  flashes: {},
  flash: (seatId, kind) => {
    const n = ++nonce;
    set((s) => ({ flashes: { ...s.flashes, [seatId]: { kind, nonce: n } } }));
    setTimeout(() => {
      if (get().flashes[seatId]?.nonce === n) get().clearFlash(seatId);
    }, FLASH_MS);
  },
  clearFlash: (seatId) =>
    set((s) => {
      if (!(seatId in s.flashes)) return s;
      const { [seatId]: _gone, ...rest } = s.flashes;
      return { flashes: rest };
    }),
}));
