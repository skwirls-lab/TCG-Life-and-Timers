"use client";
/** Board-local UI state (not persisted): seat menu target, quick commander mode, popovers. */
import { create } from "zustand";
import type { SeatMenuTab } from "@/features/seat/SeatMenu";
import type { Rotation } from "@/lib/ui/rotation";

export interface SeatMenuTarget {
  seatId: string;
  tab?: SeatMenuTab;
  focusCounterId?: string;
  /** the tile's on-screen rotation, so the menu faces that player */
  rotation?: Rotation;
}

interface BoardUiState {
  menu: SeatMenuTarget | null;
  /** CMD-006 quick commander-damage mode. */
  cmdMode: boolean;
  openMenu: (target: SeatMenuTarget) => void;
  closeMenu: () => void;
  setCmdMode: (on: boolean) => void;
}

export const useBoardUi = create<BoardUiState>((set) => ({
  menu: null,
  cmdMode: false,
  openMenu: (menu) => set({ menu }),
  closeMenu: () => set({ menu: null }),
  setCmdMode: (cmdMode) => set({ cmdMode }),
}));
