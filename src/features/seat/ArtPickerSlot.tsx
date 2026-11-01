"use client";
/**
 * Card art backgrounds (Scryfall / upload, SET-002 options 1–2) in the seat menu Player tab.
 * Owned by the ART lane: the flow lives in src/features/art/ArtPicker.tsx.
 */
import type { SeatId } from "@/engine";
import { ArtPicker } from "@/features/art/ArtPicker";

export interface ArtPickerSlotProps {
  seatId: SeatId;
  /** preset of the current game (commander-type presets may offer "save as deck commander") */
  presetId: string;
}

export function ArtPickerSlot({ seatId, presetId }: ArtPickerSlotProps) {
  return <ArtPicker seatId={seatId} presetId={presetId} />;
}
