"use client";
import { create } from "zustand";

/** Overlay dismissals that survive board remounts (e.g. visiting Settings and coming back). */
interface FlowUiState {
  /** `${gameId}:${eventId}` of first-player announcements already shown or skipped. */
  announced: string[];
  /** `${gameId}:${endedAt}` of game-over overlays the user closed. */
  closedGameOver: string[];
  markAnnounced: (key: string) => void;
  closeGameOver: (key: string) => void;
}

export const useFlowUi = create<FlowUiState>((set) => ({
  announced: [],
  closedGameOver: [],
  markAnnounced: (key) => set((s) => ({ announced: [...s.announced.slice(-20), key] })),
  closeGameOver: (key) => set((s) => ({ closedGameOver: [...s.closedGameOver.slice(-20), key] })),
}));
