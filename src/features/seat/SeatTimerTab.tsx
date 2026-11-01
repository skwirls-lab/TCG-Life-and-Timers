"use client";
/**
 * SLOT (owned by the TIMER-UI lane in W3, which replaces this body; keep the exports + props).
 * Seat menu Timer tab (SEAT-003): remaining / used time, adjust, concede, eliminate/revive.
 */
import type { Game, SeatId } from "@/engine";
import { t } from "@/lib/i18n";

export interface SeatTimerTabProps {
  seatId: SeatId;
}

/** Whether the seat menu shows the Timer tab for this game (the TIMER-UI lane may refine it). */
export function seatTimerTabVisible(_game: Game): boolean {
  return true;
}

export function SeatTimerTab(_props: SeatTimerTabProps) {
  return (
    <p className="py-6 text-center text-fg-muted" data-testid="seat-timer-placeholder">
      {t("seat.timer.placeholder")}
    </p>
  );
}
