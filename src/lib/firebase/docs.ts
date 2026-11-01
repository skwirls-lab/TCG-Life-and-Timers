/**
 * Firestore document shapes: the single source of truth for everything the client writes.
 * `firestore.rules` mirrors these schemas (SEC-003); keep both in sync and keep LIMITS identical.
 *
 * Conventions
 * - `updatedAt` / `createdAt` are Firestore server timestamps. Rules require
 *   `updatedAt == request.time` on every client write, so clients MUST write `serverTimestamp()`.
 *   The `*DataSchema` variants describe the client-authored fields only; a write is
 *   `{ ...xDataSchema.parse(v), updatedAt: serverTimestamp() }`. The `*DocSchema` variants
 *   describe what is read back (server-time fields are Timestamp instances).
 * - Domain times that the client owns (game `startedAt` / `endedAt`) are epoch milliseconds.
 * - Soft deletes use a `deleted: true` tombstone so LWW sync can propagate deletions (SYNC-002).
 * - String limits are counted in characters (Firestore rules `string.size()`).
 *
 * This module has no Firebase SDK import so it stays cheap to load and unit-testable.
 */
import { z } from "zod";

const KB = 1024;

export const LIMITS = {
  idMax: 100,
  displayNameMax: 100,
  settingsKeysMax: 200,
  profileNameMax: 40,
  colorMax: 32,
  artValueMax: 2048,
  artTextMax: 200,
  deckNameMax: 60,
  commandersMax: 2,
  commanderNameMax: 120,
  colorIdentityMax: 5,
  presetNameMax: 60,
  gameNameMax: 60,
  presetPayloadMax: 200 * KB,
  seatsMax: 8,
  gameLogMax: 500 * KB,
  artNameMax: 80,
  artBytesMax: 2 * KB * KB - 1, // storage rules: size < 2 MB (SEC-004)
  artDimensionMax: 10000,
  schemaVersionMax: 1000,
  shareCodeLength: 8,
  feedbackTextMax: 4000,
  emailMax: 200,
  appVersionMax: 32,
  diagnosticsMax: 200 * KB,
} as const;

/** Duck-typed Firestore Timestamp (avoids importing the SDK). Instances are preserved by parse. */
export interface TimestampLike {
  readonly seconds: number;
  readonly nanoseconds: number;
}
export const timestampSchema = z.custom<TimestampLike>(
  (v) =>
    typeof v === "object" &&
    v !== null &&
    typeof (v as TimestampLike).seconds === "number" &&
    typeof (v as TimestampLike).nanoseconds === "number",
  { message: "expected a Firestore Timestamp" },
);

export const idSchema = z
  .string()
  .regex(/^[A-Za-z0-9_.:-]+$/)
  .min(1)
  .max(LIMITS.idMax);
const schemaVersion = z.number().int().min(1).max(LIMITS.schemaVersionMax);
const tombstone = z.boolean().optional();

export const focalSchema = z.strictObject({
  x: z.number().min(0).max(1),
  y: z.number().min(0).max(1),
  /** art zoom (D-052) */
  zoom: z.number().min(0.1).max(10).optional(),
});

export const ART_KINDS = ["scryfall", "upload", "gradient", "solid"] as const;
export const artRefSchema = z.strictObject({
  kind: z.enum(ART_KINDS),
  value: z.string().max(LIMITS.artValueMax),
  focal: focalSchema.optional(),
  artist: z.string().max(LIMITS.artTextMax).optional(),
  cardName: z.string().max(LIMITS.artTextMax).optional(),
});
export type ArtRef = z.infer<typeof artRefSchema>;

// users/{uid}
export const userDataSchema = z.strictObject({
  displayName: z.string().max(LIMITS.displayNameMax),
  meProfileId: idSchema.optional(),
  settings: z
    .record(z.string(), z.unknown())
    .refine((s) => Object.keys(s).length <= LIMITS.settingsKeysMax, "too many settings")
    .optional(),
});
export const userDocSchema = userDataSchema.extend({
  createdAt: timestampSchema,
  updatedAt: timestampSchema,
});
export type UserData = z.infer<typeof userDataSchema>;
export type UserDoc = z.infer<typeof userDocSchema>;

// users/{uid}/profiles/{profileId}
export const profileDataSchema = z.strictObject({
  name: z.string().min(1).max(LIMITS.profileNameMax),
  normalizedName: z.string().max(LIMITS.profileNameMax),
  color: z.string().max(LIMITS.colorMax),
  art: artRefSchema.optional(),
  contrast: z.boolean(),
  deleted: tombstone,
});
export const profileDocSchema = profileDataSchema.extend({ updatedAt: timestampSchema });
export type ProfileData = z.infer<typeof profileDataSchema>;
export type ProfileDoc = z.infer<typeof profileDocSchema>;

// users/{uid}/profiles/{profileId}/decks/{deckId}
export const COLOR_LETTERS = ["W", "U", "B", "R", "G"] as const;
export const deckDataSchema = z.strictObject({
  name: z.string().min(1).max(LIMITS.deckNameMax),
  presetId: idSchema,
  commanders: z.array(z.string().min(1).max(LIMITS.commanderNameMax)).max(LIMITS.commandersMax),
  art: artRefSchema.optional(),
  colorIdentity: z
    .array(z.enum(COLOR_LETTERS))
    .max(LIMITS.colorIdentityMax)
    .refine((a) => new Set(a).size === a.length, "duplicate colors"),
  deleted: tombstone,
});
export const deckDocSchema = deckDataSchema.extend({ updatedAt: timestampSchema });
export type DeckData = z.infer<typeof deckDataSchema>;
export type DeckDoc = z.infer<typeof deckDocSchema>;

/** A JSON-encoded string of at most `max` characters. */
const jsonString = (max: number) =>
  z
    .string()
    .max(max)
    .refine((s) => {
      try {
        JSON.parse(s);
        return true;
      } catch {
        return false;
      }
    }, "not valid JSON");

// users/{uid}/presets/{presetId}
export const presetDataSchema = z.strictObject({
  name: z.string().min(1).max(LIMITS.presetNameMax),
  game: z.string().max(LIMITS.gameNameMax),
  payload: jsonString(LIMITS.presetPayloadMax),
  schemaVersion,
  deleted: tombstone,
});
export const presetDocSchema = presetDataSchema.extend({ updatedAt: timestampSchema });
export type PresetData = z.infer<typeof presetDataSchema>;
export type PresetDoc = z.infer<typeof presetDocSchema>;

// users/{uid}/games/{gameId} (write-once, SYNC-003: later writes may only touch updatedAt/deleted)
export const gameSeatSchema = z.strictObject({
  name: z.string().max(LIMITS.profileNameMax),
  profileId: idSchema.optional(),
  deckId: idSchema.optional(),
  deckName: z.string().max(LIMITS.deckNameMax).optional(),
  winner: z.boolean(),
  place: z.number().int().min(1).max(LIMITS.seatsMax).optional(),
});
const epochMs = z.number().int().min(0);
const gameBaseSchema = z.strictObject({
  schemaVersion,
  presetId: idSchema,
  game: z.string().max(LIMITS.gameNameMax),
  startedAt: epochMs,
  endedAt: epochMs,
  durationMs: epochMs,
  seats: z.array(gameSeatSchema).min(1).max(LIMITS.seatsMax),
  /** Compressed (e.g. deflate + base64) event log; absent once compacted (HIST-007). */
  log: z.string().max(LIMITS.gameLogMax).optional(),
  deleted: tombstone,
});
const endsAfterStart = (g: { startedAt: number; endedAt: number }) => g.endedAt >= g.startedAt;
export const gameDataSchema = gameBaseSchema.refine(endsAfterStart, "endedAt before startedAt");
export const gameDocSchema = gameBaseSchema
  .extend({ updatedAt: timestampSchema })
  .refine(endsAfterStart, "endedAt before startedAt");
export type GameSeat = z.infer<typeof gameSeatSchema>;
export type GameData = z.infer<typeof gameDataSchema>;
export type GameDoc = z.infer<typeof gameDocSchema>;

// users/{uid}/art/{artId}  (binary lives in Storage at users/{uid}/art/{file}, ART-022)
export const artDataSchema = z.strictObject({
  storagePath: z
    .string()
    .max(300)
    .regex(/^users\/[^/]+\/art\/[A-Za-z0-9_.-]+$/),
  width: z.number().int().min(1).max(LIMITS.artDimensionMax),
  height: z.number().int().min(1).max(LIMITS.artDimensionMax),
  bytes: z.number().int().min(1).max(LIMITS.artBytesMax),
  contentType: z
    .string()
    .max(100)
    .regex(/^image\/.+$/),
  focal: focalSchema.optional(),
  name: z.string().max(LIMITS.artNameMax),
  deleted: tombstone,
});
export const artDocSchema = artDataSchema.extend({ updatedAt: timestampSchema });
export type ArtData = z.infer<typeof artDataSchema>;
export type ArtDoc = z.infer<typeof artDocSchema>;

/** storagePath for an uploaded image (must be under the owner's prefix; rules check this). */
export function artStoragePath(uid: string, artId: string, ext = "webp"): string {
  return `users/${uid}/art/${artId}.${ext}`;
}

// users/{uid}/private/entitlements: client READ-ONLY, written by functions (SEC-002)
export const ENTITLEMENT_SOURCES = ["none", "subscription", "lifetime", "manual"] as const;
export const entitlementsDocSchema = z.strictObject({
  pro: z.boolean(),
  source: z.enum(ENTITLEMENT_SOURCES),
  updatedAt: timestampSchema,
});
export type EntitlementsDoc = z.infer<typeof entitlementsDocSchema>;

// sharedPresets/{code}: public read, immutable (SEC-005, CUS-007)
export const SHARE_CODE_RE = /^[A-Za-z0-9]{8}$/;
/** Share payloads carry no images (LEG-005); rules reject inline data: images and Storage URLs. */
const NO_IMAGES_RE = /data:image\/|firebasestorage\.googleapis\.com/;
export const sharedPresetDataSchema = z.strictObject({
  code: z.string().regex(SHARE_CODE_RE),
  ownerUid: z.string().min(1).max(128),
  name: z.string().min(1).max(LIMITS.presetNameMax),
  game: z.string().max(LIMITS.gameNameMax),
  payload: jsonString(LIMITS.presetPayloadMax).refine(
    (s) => !NO_IMAGES_RE.test(s),
    "share payloads may not embed images",
  ),
});
export const sharedPresetDocSchema = sharedPresetDataSchema.extend({ createdAt: timestampSchema });
export type SharedPresetData = z.infer<typeof sharedPresetDataSchema>;
export type SharedPresetDoc = z.infer<typeof sharedPresetDocSchema>;

// feedback/{id}: create-only (SET-041/042)
export const FEEDBACK_CATEGORIES = ["bug", "idea", "other"] as const;
export const feedbackDataSchema = z.strictObject({
  category: z.enum(FEEDBACK_CATEGORIES),
  text: z.string().min(1).max(LIMITS.feedbackTextMax),
  email: z.string().max(LIMITS.emailMax).optional(),
  appVersion: z.string().min(1).max(LIMITS.appVersionMax),
  /** Must equal the caller's auth uid when present. */
  uid: z.string().min(1).max(128).optional(),
  /** JSON string shown to the user before sending (SET-042). */
  diagnostics: jsonString(LIMITS.diagnosticsMax).optional(),
});
export const feedbackDocSchema = feedbackDataSchema.extend({ createdAt: timestampSchema });
export type FeedbackData = z.infer<typeof feedbackDataSchema>;
export type FeedbackDoc = z.infer<typeof feedbackDocSchema>;

// customers/{uid}/checkout_sessions/{id}: the only client-writable Stripe-extension doc (M7)
export const checkoutSessionDataSchema = z.strictObject({
  price: z.string().regex(/^price_[A-Za-z0-9]+$/),
  success_url: z.url().max(2048),
  cancel_url: z.url().max(2048),
  mode: z.enum(["subscription", "payment"]).optional(),
  allow_promotion_codes: z.boolean().optional(),
  trial_from_plan: z.boolean().optional(),
  quantity: z.number().int().min(1).max(10).optional(),
  metadata: z.record(z.string(), z.string()).optional(),
});
export type CheckoutSessionData = z.infer<typeof checkoutSessionDataSchema>;

/** Document / collection paths. Every user path is scoped by uid (SEC-001). */
export const paths = {
  user: (uid: string) => `users/${uid}`,
  profiles: (uid: string) => `users/${uid}/profiles`,
  profile: (uid: string, profileId: string) => `users/${uid}/profiles/${profileId}`,
  decks: (uid: string, profileId: string) => `users/${uid}/profiles/${profileId}/decks`,
  deck: (uid: string, profileId: string, deckId: string) =>
    `users/${uid}/profiles/${profileId}/decks/${deckId}`,
  presets: (uid: string) => `users/${uid}/presets`,
  preset: (uid: string, presetId: string) => `users/${uid}/presets/${presetId}`,
  games: (uid: string) => `users/${uid}/games`,
  game: (uid: string, gameId: string) => `users/${uid}/games/${gameId}`,
  arts: (uid: string) => `users/${uid}/art`,
  art: (uid: string, artId: string) => `users/${uid}/art/${artId}`,
  entitlements: (uid: string) => `users/${uid}/private/entitlements`,
  customer: (uid: string) => `customers/${uid}`,
  checkoutSessions: (uid: string) => `customers/${uid}/checkout_sessions`,
  checkoutSession: (uid: string, id: string) => `customers/${uid}/checkout_sessions/${id}`,
  subscriptions: (uid: string) => `customers/${uid}/subscriptions`,
  payments: (uid: string) => `customers/${uid}/payments`,
  sharedPresets: () => "sharedPresets",
  sharedPreset: (code: string) => `sharedPresets/${code}`,
  feedback: () => "feedback",
} as const;
