"use client";
/**
 * PERF-003: board sheets loaded on demand (and prefetched when the board is idle, see PlayScreen).
 * Kept apart from the toolbar so /play's first load carries neither.
 */
import { lazyComponent } from "@/lib/hooks/lazyComponent";

export const QuickToolsMenu = lazyComponent(() =>
  import("@/features/tools/QuickToolsMenu").then((m) => m.QuickToolsMenu),
);
export const PlayersSheet = lazyComponent(() =>
  import("./PlayersSheet").then((m) => m.PlayersSheet),
);
/** The legacy toolbar strip (menu style "strip", or a shared track such as Digimon memory). */
export const Toolbar = lazyComponent(() => import("./Toolbar").then((m) => m.Toolbar));
/** MENU: the center menu panel. */
export const CenterMenuPanel = lazyComponent(() =>
  import("./CenterMenuPanel").then((m) => m.CenterMenuPanel),
);
