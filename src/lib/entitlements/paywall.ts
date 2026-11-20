"use client";
/**
 * Paywall (T7.1, PAY-004): a tiny global store so any locked feature can open the single
 * `PaywallHost` sheet (`usePaywall.getState().open("players7to8")`), plus the Free vs Pro
 * comparison model from PRD §17.2.
 */
import { create } from "zustand";
import type { MessageKey } from "@/lib/i18n";
import type { ProFeature } from "./features";

interface PaywallStore {
  isOpen: boolean;
  /** The locked feature the user tapped (highlighted in the table), if any. */
  feature: ProFeature | null;
  open: (feature?: ProFeature | null) => void;
  close: () => void;
}

export const usePaywall = create<PaywallStore>((set) => ({
  isOpen: false,
  feature: null,
  open: (feature = null) => set({ isOpen: true, feature }),
  close: () => set({ isOpen: false, feature: null }),
}));

/** Open the paywall from non-React code (e.g. an async save path). */
export function openPaywall(feature?: ProFeature | null): void {
  usePaywall.getState().open(feature);
}

export type Cell = { kind: "yes" } | { kind: "no" } | { kind: "text"; key: MessageKey };
export type Area = "play" | "tools" | "timers" | "customize" | "history" | "sync" | "ads";

export interface ComparisonRow {
  id: string;
  area: Area;
  label: MessageKey;
  free: Cell;
  pro: Cell;
  /** Gated features this row sells (used to highlight the row the user came from). */
  features: readonly ProFeature[];
}

const yes: Cell = { kind: "yes" };
const no: Cell = { kind: "no" };
const text = (key: MessageKey): Cell => ({ kind: "text", key });

/** PRD §17.2 Free vs. Pro table, row for row. */
export const COMPARISON_ROWS: readonly ComparisonRow[] = [
  { id: "basePlay", area: "play", label: "pay.row.basePlay", free: yes, pro: yes, features: [] },
  {
    id: "players78",
    area: "play",
    label: "pay.row.players78",
    free: no,
    pro: yes,
    features: ["players7to8"],
  },
  { id: "counters", area: "play", label: "pay.row.counters", free: yes, pro: yes, features: [] },
  // ART-007: Scryfall art is never paywalled.
  { id: "art", area: "play", label: "pay.row.art", free: yes, pro: yes, features: [] },
  { id: "camera", area: "play", label: "pay.row.camera", free: yes, pro: yes, features: [] },
  { id: "tools", area: "tools", label: "pay.row.tools", free: yes, pro: yes, features: [] },
  {
    id: "timersBasic",
    area: "timers",
    label: "pay.row.timersBasic",
    free: yes,
    pro: yes,
    features: [],
  },
  {
    id: "presets",
    area: "customize",
    label: "pay.row.presets",
    free: text("pay.cell.one"),
    pro: text("pay.cell.unlimitedShare"),
    features: ["customPresetsUnlimited", "presetShareLinks"],
  },
  {
    id: "savedSetups",
    area: "customize",
    label: "pay.row.savedSetups",
    free: text("pay.cell.one"),
    pro: text("pay.cell.unlimited"),
    features: ["savedSetupsUnlimited"],
  },
  {
    id: "profiles",
    area: "customize",
    label: "pay.row.profiles",
    free: text("pay.cell.profilesFree"),
    pro: text("pay.cell.unlimited"),
    features: ["profilesUnlimited"],
  },
  {
    id: "themes",
    area: "customize",
    label: "pay.row.themes",
    free: text("pay.cell.defaultThemes"),
    pro: yes,
    features: ["themesPro"],
  },
  {
    id: "currentGame",
    area: "history",
    label: "pay.row.currentGame",
    free: yes,
    pro: yes,
    features: [],
  },
  {
    id: "pastGames",
    area: "history",
    label: "pay.row.pastGames",
    free: text("pay.cell.recent5"),
    pro: text("pay.cell.all"),
    features: ["historyFull"],
  },
  {
    id: "playersTab",
    area: "history",
    label: "pay.row.playersTab",
    free: yes,
    pro: text("pay.cell.playerDetail"),
    features: ["historyPlayerDetail"],
  },
  {
    id: "decksTab",
    area: "history",
    label: "pay.row.decksTab",
    free: text("pay.cell.top3"),
    pro: yes,
    features: ["historyDecks"],
  },
  {
    id: "insights",
    area: "history",
    label: "pay.row.insights",
    free: text("pay.cell.summaryTiles"),
    pro: text("pay.cell.fullInsights"),
    features: ["historyInsightsFull"],
  },
  {
    id: "filters",
    area: "history",
    label: "pay.row.filters",
    free: text("pay.cell.dateOnly"),
    pro: text("pay.cell.allFilters"),
    features: ["historyFiltersAll"],
  },
  {
    id: "export",
    area: "history",
    label: "pay.row.export",
    free: no,
    pro: yes,
    features: ["historyExport"],
  },
  {
    id: "accountSync",
    area: "sync",
    label: "pay.row.accountSync",
    free: yes,
    pro: yes,
    features: [],
  },
  {
    id: "historySync",
    area: "sync",
    label: "pay.row.historySync",
    free: text("pay.cell.onDevice"),
    pro: yes,
    features: ["historySync"],
  },
  {
    id: "artSync",
    area: "sync",
    label: "pay.row.artSync",
    free: text("pay.cell.images5"),
    pro: text("pay.cell.images200"),
    features: ["cloudArtExtended"],
  },
  {
    id: "ads",
    area: "ads",
    label: "pay.row.ads",
    free: text("pay.cell.none"),
    pro: text("pay.cell.none"),
    features: [],
  },
];

/** The comparison row that sells `feature` (null when none, e.g. the generic Upgrade entry). */
export function rowForFeature(feature: ProFeature | null | undefined): ComparisonRow | null {
  if (!feature) return null;
  return COMPARISON_ROWS.find((r) => r.features.includes(feature)) ?? null;
}

/** Rows grouped by area, in table order. */
export function rowsByArea(): { area: Area; rows: ComparisonRow[] }[] {
  const out: { area: Area; rows: ComparisonRow[] }[] = [];
  for (const row of COMPARISON_ROWS) {
    const last = out[out.length - 1];
    if (last && last.area === row.area) last.rows.push(row);
    else out.push({ area: row.area, rows: [row] });
  }
  return out;
}
