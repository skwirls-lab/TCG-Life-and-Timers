"use client";
/**
 * MENU: mounts the (lazy) center menu panel and the sheets opened from it, outside the board's
 * positioned layer so `fixed` overlays cover the whole screen. The calculator sheet is mounted by
 * PlayScreen (its onClose applies the menu's closing rule).
 */
import { isCenterMenu, useBoardUi } from "./boardStore";
import { closeCenterMenu } from "./centerMenu";
import { CenterMenuPanel, GameSaveSetupSheet, PlayersSheet, QuickToolsMenu } from "./lazySheets";

export function CenterMenuHost() {
  const view = useBoardUi((s) => (isCenterMenu(s.menu) ? (s.menu.sub ?? "panel") : null));
  // Leaving for a page: the same (hidden) panel stays mounted so its Back entry is kept.
  if (view === "panel" || view === "route") return <CenterMenuPanel leaving={view === "route"} />;
  if (view === "players") return <PlayersSheet open onClose={() => closeCenterMenu()} />;
  if (view === "tools") return <QuickToolsMenu open onClose={() => closeCenterMenu()} />;
  // Saved setups: "Save as preset" (lazy, so /play's first load doesn't carry it).
  if (view === "savePreset") return <GameSaveSetupSheet onClose={() => closeCenterMenu()} />;
  return null;
}
