// @vitest-environment node
import { describe, expect, it } from "vitest";
import {
  LIMITS,
  artDataSchema,
  artDocSchema,
  artRefSchema,
  artStoragePath,
  checkoutSessionDataSchema,
  deckDataSchema,
  entitlementsDocSchema,
  feedbackDataSchema,
  gameDataSchema,
  gameDocSchema,
  paths,
  presetDataSchema,
  profileDataSchema,
  profileDocSchema,
  sharedPresetDataSchema,
  timestampSchema,
  userDataSchema,
  userDocSchema,
} from "./docs";

const ts = { seconds: 1, nanoseconds: 0 };
const profile = { name: "JP", normalizedName: "jp", color: "#fff", contrast: false };
const deck = { name: "Toxrill", presetId: "mtg-commander", commanders: [], colorIdentity: ["U"] };
const game = {
  schemaVersion: 1,
  presetId: "mtg-commander",
  game: "Magic",
  startedAt: 10,
  endedAt: 20,
  durationMs: 10,
  seats: [{ name: "JP", winner: true }],
};

describe("firestore doc schemas (SEC-003)", () => {
  // @req SEC-003
  it("accepts Firestore Timestamps and preserves the instance", () => {
    class FakeTs {
      seconds = 5;
      nanoseconds = 0;
    }
    const t = new FakeTs();
    expect(timestampSchema.parse(t)).toBe(t);
    expect(timestampSchema.safeParse(123).success).toBe(false);
    expect(timestampSchema.safeParse(null).success).toBe(false);
  });

  // @req SEC-003
  it("validates users with a capped settings map", () => {
    expect(userDataSchema.parse({ displayName: "A", settings: { a: 1 } })).toBeTruthy();
    const settings = Object.fromEntries(
      Array.from({ length: LIMITS.settingsKeysMax + 1 }, (_, i) => [`k${i}`, i]),
    );
    expect(userDataSchema.safeParse({ displayName: "A", settings }).success).toBe(false);
    expect(
      userDocSchema.safeParse({ displayName: "A", createdAt: ts, updatedAt: ts }).success,
    ).toBe(true);
  });

  // @req SEC-003
  it("enforces the 40-char profile name and rejects extra keys", () => {
    expect(profileDataSchema.safeParse(profile).success).toBe(true);
    expect(profileDataSchema.safeParse({ ...profile, name: "x".repeat(41) }).success).toBe(false);
    expect(profileDataSchema.safeParse({ ...profile, extra: 1 }).success).toBe(false);
    expect(profileDocSchema.safeParse({ ...profile, updatedAt: ts, deleted: true }).success).toBe(
      true,
    );
  });

  // @req SEC-003
  it("validates art refs", () => {
    expect(artRefSchema.safeParse({ kind: "solid", value: "#000" }).success).toBe(true);
    expect(artRefSchema.safeParse({ kind: "gif", value: "" }).success).toBe(false);
    expect(
      artRefSchema.safeParse({ kind: "upload", value: "a", focal: { x: 1.5, y: 0 } }).success,
    ).toBe(false);
  });

  // @req SEC-003
  it("limits deck commanders and color identity", () => {
    expect(deckDataSchema.safeParse(deck).success).toBe(true);
    expect(deckDataSchema.safeParse({ ...deck, commanders: ["a", "b", "c"] }).success).toBe(false);
    expect(deckDataSchema.safeParse({ ...deck, colorIdentity: ["U", "U"] }).success).toBe(false);
    expect(deckDataSchema.safeParse({ ...deck, colorIdentity: ["P"] }).success).toBe(false);
  });

  // @req SEC-003
  it("requires preset payloads to be JSON within 200 KB", () => {
    const p = { name: "P", game: "G", payload: "{}", schemaVersion: 1 };
    expect(presetDataSchema.safeParse(p).success).toBe(true);
    expect(presetDataSchema.safeParse({ ...p, payload: "{nope" }).success).toBe(false);
    const big = JSON.stringify("x".repeat(LIMITS.presetPayloadMax));
    expect(presetDataSchema.safeParse({ ...p, payload: big }).success).toBe(false);
  });

  // @req SYNC-003
  it("validates game records", () => {
    expect(gameDataSchema.safeParse(game).success).toBe(true);
    expect(gameDataSchema.safeParse({ ...game, endedAt: 5 }).success).toBe(false);
    expect(gameDataSchema.safeParse({ ...game, seats: [] }).success).toBe(false);
    expect(gameDocSchema.safeParse({ ...game, updatedAt: ts }).success).toBe(true);
    expect(gameDocSchema.safeParse({ ...game, updatedAt: ts, endedAt: 5 }).success).toBe(false);
  });

  // @req ART-022
  it("validates art metadata and builds storage paths under the owner prefix", () => {
    const a = {
      storagePath: artStoragePath("u1", "a1"),
      width: 10,
      height: 10,
      bytes: 100,
      contentType: "image/webp",
      name: "x",
    };
    expect(a.storagePath).toBe("users/u1/art/a1.webp");
    expect(artDataSchema.safeParse(a).success).toBe(true);
    expect(artDocSchema.safeParse({ ...a, updatedAt: ts }).success).toBe(true);
    expect(artDataSchema.safeParse({ ...a, contentType: "text/html" }).success).toBe(false);
    expect(artDataSchema.safeParse({ ...a, bytes: 2 * 1024 * 1024 }).success).toBe(false);
    expect(artDataSchema.safeParse({ ...a, storagePath: "public/a.webp" }).success).toBe(false);
  });

  // @req SEC-002
  it("describes entitlements", () => {
    expect(
      entitlementsDocSchema.safeParse({ pro: true, source: "lifetime", updatedAt: ts }).success,
    ).toBe(true);
    expect(
      entitlementsDocSchema.safeParse({ pro: "yes", source: "x", updatedAt: ts }).success,
    ).toBe(false);
  });

  // @req CUS-007
  // @req LEG-005
  it("validates shared presets: 8-char code and no embedded images", () => {
    const env = (extra: object = {}) =>
      JSON.stringify({ format: "tcg-life-preset", version: 1, preset: { id: "x", ...extra } });
    const s = { code: "Ab3dEf7h", ownerUid: "u1", name: "P", game: "G", payload: env() };
    expect(sharedPresetDataSchema.safeParse(s).success).toBe(true);
    expect(sharedPresetDataSchema.safeParse({ ...s, code: "short" }).success).toBe(false);
    // B-5: the payload must be a preset export envelope (rules check the same prefix).
    expect(sharedPresetDataSchema.safeParse({ ...s, payload: "{}" }).success).toBe(false);
    expect(
      sharedPresetDataSchema.safeParse({ ...s, payload: JSON.stringify({ format: "x" }) }).success,
    ).toBe(false);
    for (const art of [
      "data:image/png",
      "DATA:IMAGE/png",
      "https://FIREBASESTORAGE.googleapis.com/x",
    ])
      expect(sharedPresetDataSchema.safeParse({ ...s, payload: env({ art }) }).success).toBe(false);
  });

  // @req SET-041
  // @req SET-042
  it("validates feedback", () => {
    const f = { category: "bug", text: "t", appVersion: "0.1.0" };
    expect(feedbackDataSchema.safeParse(f).success).toBe(true);
    expect(feedbackDataSchema.safeParse({ ...f, category: "spam" }).success).toBe(false);
    expect(feedbackDataSchema.safeParse({ ...f, diagnostics: "{bad" }).success).toBe(false);
    expect(feedbackDataSchema.safeParse({ ...f, text: "x".repeat(4001) }).success).toBe(false);
  });

  // @req SEC-002
  it("validates checkout session requests", () => {
    const c = { price: "price_1", success_url: "https://a.b/ok", cancel_url: "https://a.b/no" };
    expect(checkoutSessionDataSchema.safeParse(c).success).toBe(true);
    expect(checkoutSessionDataSchema.safeParse({ ...c, price: "prod_1" }).success).toBe(false);
  });
});

describe("paths", () => {
  // @req SEC-001
  it("scopes every user path by uid", () => {
    expect(paths.user("u")).toBe("users/u");
    expect(paths.profiles("u")).toBe("users/u/profiles");
    expect(paths.profile("u", "p")).toBe("users/u/profiles/p");
    expect(paths.decks("u", "p")).toBe("users/u/profiles/p/decks");
    expect(paths.deck("u", "p", "d")).toBe("users/u/profiles/p/decks/d");
    expect(paths.presets("u")).toBe("users/u/presets");
    expect(paths.preset("u", "x")).toBe("users/u/presets/x");
    expect(paths.games("u")).toBe("users/u/games");
    expect(paths.game("u", "g")).toBe("users/u/games/g");
    expect(paths.arts("u")).toBe("users/u/art");
    expect(paths.art("u", "a")).toBe("users/u/art/a");
    expect(paths.entitlements("u")).toBe("users/u/private/entitlements");
    expect(paths.customer("u")).toBe("customers/u");
    expect(paths.checkoutSessions("u")).toBe("customers/u/checkout_sessions");
    expect(paths.checkoutSession("u", "s")).toBe("customers/u/checkout_sessions/s");
    expect(paths.subscriptions("u")).toBe("customers/u/subscriptions");
    expect(paths.payments("u")).toBe("customers/u/payments");
    expect(paths.sharedPresets()).toBe("sharedPresets");
    expect(paths.sharedPreset("c")).toBe("sharedPresets/c");
    expect(paths.feedback()).toBe("feedback");
  });
});
