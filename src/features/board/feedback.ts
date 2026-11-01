"use client";
/** INP-008 tap feedback: haptic tick, optional click sound, number pop (reduced-motion aware). */
import { browserAudio } from "@/lib/device/audio";
import { browserHaptics, vibrate, type HapticsEnv } from "@/lib/device/haptics";
import { useSettingsStore } from "@/state/settingsStore";
import { prefersReducedMotion } from "./boardHelpers";

let haptics: HapticsEnv | null = null;

export function reducedMotion(): boolean {
  const setting = useSettingsStore.getState().settings.reduceMotion;
  const system =
    typeof window !== "undefined" &&
    typeof window.matchMedia === "function" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  return prefersReducedMotion(setting, system);
}

export function tapFeedback(el?: HTMLElement | null): void {
  const { haptics: hapticsOn, sounds } = useSettingsStore.getState().settings;
  haptics ??= browserHaptics();
  vibrate(haptics, "tick", hapticsOn);
  if (sounds.taps) browserAudio().play("tap", sounds.volume);
  if (el && typeof el.animate === "function" && !reducedMotion()) {
    el.animate([{ transform: "scale(1.06)" }, { transform: "scale(1)" }], {
      duration: 140,
      easing: "ease-out",
    });
  }
}
