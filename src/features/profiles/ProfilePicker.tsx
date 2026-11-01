"use client";
/**
 * CONTRACT STUB (owned by the SEATMENU lane, which replaces the body).
 * "Load" a saved profile (+ optional deck) into a seat (PROF-002, PROF-010). Recent first.
 * Used by the seat menu Player tab and by the setup flow's seats step.
 */
import type { Rotation } from "@/lib/ui/rotation";
import type { ProfileSelection } from "@/lib/profiles/types";

export interface ProfilePickerProps {
  open: boolean;
  onClose: () => void;
  onPick: (selection: ProfileSelection) => void;
  rotation?: Rotation;
  /** filter decks to this preset when choosing a deck */
  presetId?: string;
}

export function ProfilePicker(_props: ProfilePickerProps) {
  return null;
}
