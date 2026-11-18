/**
 * Pro feature registry (PRD §17.2, ARCH-008, PAY-001).
 * Every gated capability is listed here; UI asks `can(feature)` and never checks tiers directly.
 */
export const PRO_FEATURES = [
  "players7to8",
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

/** Largest free player count (7–8 players are Pro, §17.2); matches setup's FREE_MAX_PLAYERS. */
export const FREE_MAX_PLAYERS = 6;
