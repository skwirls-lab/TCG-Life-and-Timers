"use client";
import { create } from "zustand";

/**
 * Tiny cross-feature flag: is a game currently in progress on the board?
 * The game store sets it; the PWA update prompt reads it (PWA-004).
 */
interface ActiveGameFlag {
  inProgress: boolean;
  setInProgress: (v: boolean) => void;
}

export const useActiveGameFlag = create<ActiveGameFlag>((set) => ({
  inProgress: false,
  setInProgress: (inProgress) => set({ inProgress }),
}));
