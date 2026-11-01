/**
 * Pure helpers for app-wide DOM effects (SET-001 theme, A11Y-003 reduce motion, SET-034 language).
 */
import type { AppSettings } from "@/state/settingsStore";

/** `data-theme` value for a theme setting (globals.css: dark | light | contrast). */
export function themeAttr(theme: AppSettings["theme"]): "dark" | "light" | "contrast" {
  return theme === "highContrast" ? "contrast" : theme;
}

/** Whether animations should be reduced for a setting + the system preference. */
export function shouldReduceMotion(
  setting: AppSettings["reduceMotion"],
  systemPrefersReduced: boolean,
): boolean {
  if (setting === "always") return true;
  if (setting === "never") return false;
  return systemPrefersReduced;
}
