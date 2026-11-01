"use client";
/**
 * CONTRACT STUB (owned by the SEATMENU lane, which replaces the body).
 * The rotated per-seat menu (PRD §8.2): Player / Counters / Commander damage / Timer tabs.
 * The board opens it when a seat's name pill (or a badge / mini-grid) is tapped.
 */
export type SeatMenuTab = "player" | "counters" | "commander" | "timer";

export interface SeatMenuProps {
  seatId: string;
  open: boolean;
  onClose: () => void;
  initialTab?: SeatMenuTab;
  /** counter to highlight when opened from a badge (LIFE-003) */
  focusCounterId?: string;
}

export function SeatMenu(_props: SeatMenuProps) {
  return null;
}
