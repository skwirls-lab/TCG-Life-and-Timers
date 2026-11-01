"use client";
/** Settings-page timer UI state: the "restart clocks?" confirm and the custom-duration keypad. */
import { create } from "zustand";
import type { TimerConfig } from "@/engine";

export type CustomTarget = "bankMs" | "reserveMs" | "match";

interface TimerSettingsUi {
  restart: Partial<TimerConfig> | null;
  custom: CustomTarget | null;
  askRestart: (patch: Partial<TimerConfig>) => void;
  askCustom: (target: CustomTarget) => void;
  close: () => void;
}

export const useTimerSettingsUi = create<TimerSettingsUi>((set) => ({
  restart: null,
  custom: null,
  askRestart: (restart) => set({ restart, custom: null }),
  askCustom: (custom) => set({ custom, restart: null }),
  close: () => set({ restart: null, custom: null }),
}));
