/**
 * Pro feature registry (PRD §17.2, ARCH-008, PAY-001).
 * Every gated capability is listed here; UI asks `can(feature)` and never checks tiers directly.
 */
export const PRO_FEATURES = [
  "players7to8",
  "timerAdvancedModes", // increment, delay, per-turn, hybrid, match timer, add-time-once, handicap, custom warnings
  "customPresetsUnlimited",
  "presetShareLinks",
  "profilesUnlimited",
  "historyFull", // beyond the most recent 20 games
  "historyPlayerDetail",
  "historyDecks",
  "historyInsightsFull",
  "historyFiltersAll",
  "historyExport",
  "historySync",
  "themesPro",
  "cloudArtExtended",
] as const;

export type ProFeature = (typeof PRO_FEATURES)[number];

/** Numeric limits for free users (PRD §17.2). */
export const FREE_LIMITS = {
  customPresets: 1,
  profiles: 4,
  decksPerProfile: 3,
  historyVisibleGames: 20,
  cloudArtImages: 10,
  decksPreview: 3,
} as const;

export const PRO_LIMITS = {
  cloudArtImages: 200,
} as const;
