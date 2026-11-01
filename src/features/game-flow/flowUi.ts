"use client";
import { create } from "zustand";

/** Overlay dismissals that survive board remounts (e.g. visiting Settings and coming back). */
interface FlowUiState {
  /** `${gameId}:${eventId}` of first-player announcements already shown or skipped. */
  announced: string[];
  /** `${gameId}:${endedAt}` of game-over overlays the user closed. */
  closedGameOver: string[];
  /** Game ids whose first-turn reminder (PRD §10.3) was dismissed: shown once per game. */
  hintsDismissed: string[];
  /** First-player tile markers (A-1) that timed out, by announcement key. */
  markersDone: string[];
  markerDone: (key: string) => void;
  markAnnounced: (key: string) => void;
  closeGameOver: (key: string) => void;
  dismissHint: (gameId: string) => void;
}

export const useFlowUi = create<FlowUiState>((set) => ({
  announced: [],
  closedGameOver: [],
  hintsDismissed: [],
  markersDone: [],
  markerDone: (key) => set((s) => ({ markersDone: [...s.markersDone.slice(-20), key] })),
  markAnnounced: (key) => set((s) => ({ announced: [...s.announced.slice(-20), key] })),
  closeGameOver: (key) => set((s) => ({ closedGameOver: [...s.closedGameOver.slice(-20), key] })),
  dismissHint: (gameId) =>
    set((s) => ({ hintsDismissed: [...s.hintsDismissed.slice(-20), gameId] })),
}));
