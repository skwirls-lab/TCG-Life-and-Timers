/**
 * Saved setups, shown to users as "Presets" (PROF-010 / SET-012 neighbourhood; no PRD id of their
 * own): one tap starts a game with a stored game type, house rules, clock, seat lineup, profiles
 * and decks. Not to be confused with the engine's `Preset` (a game type such as MTG Commander).
 *
 * Shape
 * - `config` is the game-config part (the same fields as the per-game-type defaults,
 *   `PresetDefaults`, minus the seat-count/per-seat maps): layout, options, timer, start and
 *   threshold overrides, enabled counters. `config.timer.seatExtraMs`, when present, is only a
 *   marker ("per-seat time is on", always `{}`): the extra time itself lives on each seat and is
 *   re-keyed to engine seat ids when a game starts (TMR-060), so removing or reordering seats can
 *   never point an extra at the wrong player.
 * - `seats` is the ordered lineup; the player count is `seats.length`. Per-seat primary start and
 *   threshold (PRE-013) and per-seat clock time live on the seat for the same reason.
 * - `art` on a seat is only background art picked by hand: deck, commander and profile art are
 *   re-derived from the current profile/deck when the game starts (precedence in
 *   src/lib/art/commanderArt.ts).
 */
import { z } from "zod";
import { ArtRefSchema, FIRST_PLAYER_RULES, GameOptionsSchema, TimerConfigSchema } from "@/engine";

export const SAVED_SETUP_SCHEMA_VERSION = 1;
export const MAX_SETUP_NAME = 60;
/** Seat field limits match the synced profile/deck limits (src/lib/firebase/docs.ts). */
const SEAT_NAME_MAX = 40;
const DECK_NAME_MAX = 60;
const COMMANDER_MAX = 120;
const ID_MAX = 100;

export const SavedSetupSeatSchema = z.object({
  name: z.string().max(SEAT_NAME_MAX),
  color: z.string().min(1).max(32),
  contrast: z.boolean().optional(),
  profileId: z.string().min(1).max(ID_MAX).optional(),
  deckId: z.string().min(1).max(ID_MAX).optional(),
  deckName: z.string().max(DECK_NAME_MAX).optional(),
  commanders: z.array(z.string().max(COMMANDER_MAX)).max(2),
  /** Background picked by hand (no `origin`). */
  art: ArtRefSchema.optional(),
  /** PRE-013 per-seat primary start / threshold. */
  start: z.number().optional(),
  threshold: z.number().optional(),
  /** TMR-060 extra starting time on the clock (ms; only used while per-seat time is on). */
  clockExtraMs: z.number().int().optional(),
});
export type SavedSetupSeat = z.infer<typeof SavedSetupSeatSchema>;

export const SavedSetupConfigSchema = z.object({
  layoutId: z.string().optional(),
  options: GameOptionsSchema.partial().optional(),
  timer: TimerConfigSchema.partial().optional(),
  startOverrides: z.record(z.string(), z.number()).optional(),
  thresholdOverrides: z.record(z.string(), z.number().nullable()).optional(),
  enabledCounters: z.array(z.string()).optional(),
});
export type SavedSetupConfig = z.infer<typeof SavedSetupConfigSchema>;

/** Everything a setup snapshot holds (what "Save as preset" captures). */
export const SetupDraftSchema = z.object({
  /** Game type (engine preset) id, built-in or `custom.*`. */
  presetId: z.string().min(1).max(ID_MAX),
  /** The game type's name when saved, shown if that game type is later deleted. */
  presetName: z.string().max(MAX_SETUP_NAME),
  config: SavedSetupConfigSchema,
  seats: z.array(SavedSetupSeatSchema).min(1).max(8),
  firstPlayerRule: z.enum(FIRST_PLAYER_RULES),
  /** PROF-010 "Set seat backgrounds to commanders" (commander game types). */
  commanderArt: z.boolean().optional(),
});
export type SetupDraft = z.infer<typeof SetupDraftSchema>;

export const SavedSetupSchema = SetupDraftSchema.extend({
  id: z.string().min(1).max(ID_MAX),
  name: z.string().min(1).max(MAX_SETUP_NAME),
  /** Position on the launcher (ascending). */
  order: z.number(),
  createdAt: z.number(),
  updatedAt: z.number(),
  lastUsedAt: z.number().optional(),
});
export type SavedSetup = z.infer<typeof SavedSetupSchema>;
