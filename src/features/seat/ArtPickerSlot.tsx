"use client";
/**
 * SLOT (owned by the ART lane in W4, which replaces this body; keep the export + props).
 * Card art backgrounds (Scryfall / upload, SET-002 options 1–2) in the seat menu Player tab.
 */
import { ImageIcon } from "lucide-react";
import type { SeatId } from "@/engine";
import { t } from "@/lib/i18n";

export interface ArtPickerSlotProps {
  seatId: SeatId;
  /** preset of the current game (commander-type presets may offer "save as deck commander") */
  presetId: string;
}

export function ArtPickerSlot(_props: ArtPickerSlotProps) {
  return (
    <button
      type="button"
      disabled
      data-testid="art-picker-slot"
      className="flex min-h-16 w-full items-center gap-3 rounded-xl border border-dashed border-border px-4 text-left text-fg-muted disabled:cursor-not-allowed"
    >
      <ImageIcon aria-hidden size={24} />
      <span>{t("seat.bg.artComingSoon")}</span>
    </button>
  );
}
