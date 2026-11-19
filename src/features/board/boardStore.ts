"use client";
/** Board-local UI state (not persisted): seat menu target, quick commander mode, popovers. */
import { create } from "zustand";
import type { SeatMenuTab } from "@/features/seat/SeatMenu";
import type { Rotation } from "@/lib/ui/rotation";

export interface SeatMenuTarget {
  kind?: "seat";
  seatId: string;
  tab?: SeatMenuTab;
  focusCounterId?: string;
  /** the tile's on-screen rotation, so the menu faces that player */
  rotation?: Rotation;
}

/** A sheet (or page) opened from the center menu; the menu panel hides while it is up. */
export type CenterMenuSub = "players" | "tools" | "calc" | "route" | "savePreset";

/**
 * MENU: the board's center menu. While it (or a sheet opened from it) is up, `menu` is non-null,
 * so the PAUSED overlay stays hidden (one overlay at a time) exactly as for the seat menu.
 */
export interface CenterMenuTarget {
  kind: "center";
  sub?: CenterMenuSub;
}

export type BoardMenuTarget = SeatMenuTarget | CenterMenuTarget;

export const isCenterMenu = (m: BoardMenuTarget | null): m is CenterMenuTarget =>
  m?.kind === "center";

interface BoardUiState {
  menu: BoardMenuTarget | null;
  /**
   * MENU: id of the game whose running clocks the center menu paused (closing the menu resumes
   * them), else null. Survives leaving the board for Settings / History / Tools from the menu.
   */
  menuPaused: string | null;
  /** CMD-006 quick commander-damage mode. */
  cmdMode: boolean;
  openMenu: (target: BoardMenuTarget) => void;
  closeMenu: () => void;
  setCmdMode: (on: boolean) => void;
  /** INP-007 calculator target (high-total presets). */
  calc: { seatId: string; rotation?: Rotation } | null;
  openCalc: (target: { seatId: string; rotation?: Rotation }) => void;
  closeCalc: () => void;
}

export const useBoardUi = create<BoardUiState>((set) => ({
  menu: null,
  menuPaused: null,
  cmdMode: false,
  openMenu: (menu) => set({ menu }),
  closeMenu: () => set({ menu: null }),
  setCmdMode: (cmdMode) => set({ cmdMode }),
  calc: null,
  openCalc: (calc) => set({ calc }),
  closeCalc: () => set({ calc: null }),
}));
