"use client";
/**
 * App-wide effects (mounted once in Providers): loads app settings, then mirrors the theme,
 * reduce-motion preference and language onto <html> (SET-001, A11Y-003, SET-034), and keeps game
 * records (HIST-003: ended / replaced games are saved by the record keeper).
 */
import { useEffect, useSyncExternalStore } from "react";
import { isCloudConfigured } from "@/lib/firebase/config";
import { useGameStore } from "@/state/gameStore";
import { useSettingsStore } from "@/state/settingsStore";
import { shouldReduceMotion, themeAttr } from "./effects";

const REDUCE_QUERY = "(prefers-reduced-motion: reduce)";

function subscribeReduced(cb: () => void): () => void {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") return () => {};
  const mq = window.matchMedia(REDUCE_QUERY);
  mq.addEventListener?.("change", cb);
  return () => mq.removeEventListener?.("change", cb);
}

function readReduced(): boolean {
  return typeof window !== "undefined" && typeof window.matchMedia === "function"
    ? window.matchMedia(REDUCE_QUERY).matches
    : false;
}

function useSystemReducedMotion(): boolean {
  return useSyncExternalStore(subscribeReduced, readReduced, () => false);
}

export function AppEffects() {
  const theme = useSettingsStore((s) => s.settings.theme);
  const reduceMotion = useSettingsStore((s) => s.settings.reduceMotion);
  const language = useSettingsStore((s) => s.settings.language);
  const systemReduced = useSystemReducedMotion();

  useEffect(() => {
    useSettingsStore
      .getState()
      .load()
      .catch((e: unknown) => console.warn("[settings] load failed", e));
  }, []);

  // Game records (HIST-003/HIST-032). Idempotent; it lives as long as the app (never stopped).
  // Loaded lazily so record building stays out of the board's initial chunks (PERF-003).
  useEffect(() => {
    void import("@/state/recordKeeper")
      .then((m) => m.startRecordKeeper(useGameStore))
      .catch((e: unknown) => console.warn("[records] keeper failed to start", e));
  }, []);

  // Cloud (App Check + auth + sync) starts lazily after first paint, only when this deployment has
  // Firebase config. The SDK stays out of the initial/board chunks (PERF-003, D-051).
  useEffect(() => {
    if (!isCloudConfigured()) return;
    const timer = window.setTimeout(() => {
      void import("@/lib/account/cloud")
        .then((m) => m.startCloud())
        .catch((e: unknown) => console.warn("[cloud] start failed", e));
    }, 1500);
    return () => window.clearTimeout(timer);
  }, []);

  useEffect(() => {
    document.documentElement.dataset.theme = themeAttr(theme);
  }, [theme]);

  useEffect(() => {
    const root = document.documentElement;
    if (shouldReduceMotion(reduceMotion, systemReduced)) root.dataset.reduceMotion = "1";
    else delete root.dataset.reduceMotion;
  }, [reduceMotion, systemReduced]);

  useEffect(() => {
    document.documentElement.lang = language;
  }, [language]);

  return null;
}

/** Reduced-motion state for components (setting + system preference). */
export function useReducedMotion(): boolean {
  const setting = useSettingsStore((s) => s.settings.reduceMotion);
  const system = useSystemReducedMotion();
  return shouldReduceMotion(setting, system);
}
