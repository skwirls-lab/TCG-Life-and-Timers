// @req SYNC-002 @req SET-014 @req PROF-003
import { describe, expect, it } from "vitest";
import type {
  StoredArt,
  StoredDeck,
  StoredPreset,
  StoredProfile,
  StoredRecord,
  StoredSetup,
} from "@/lib/db";
import {
  artMapper,
  deckMapper,
  isDeviceOnlySetting,
  isEmptySettingsItem,
  NO_PRESET,
  planSettingsApply,
  presetMapper,
  profileMapper,
  recordMapper,
  settingsToItem,
  setupMapper,
  syncedAppSettings,
  type RowMapper,
} from "./mappers";

function roundTrip<Row>(mapper: RowMapper<Row>, row: Row) {
  const item = mapper.toItem(row);
  expect(item).not.toBeNull();
  const back = mapper.fromItem({ ...item!, updatedAt: 777 }, row);
  expect(mapper.toItem(back)?.data).toEqual(item!.data);
  return { item: item!, back };
}

const profile: StoredProfile = {
  id: "p1",
  schemaVersion: 1,
  name: "  Jean   Paul ",
  normalizedName: "jean paul",
  color: "#34d399",
  contrast: true,
  isMe: true,
  lastUsedAt: 5,
  updatedAt: 100,
  art: {
    kind: "scryfall",
    value: "https://x/y.jpg",
    focal: { x: 0.2, y: 0.3, zoom: 1.5 },
    artist: "A",
  },
};

describe("profileMapper", () => {
  it("maps to the remote shape and round-trips (focal zoom syncs, D-052)", () => {
    const { item, back } = roundTrip(profileMapper, profile);
    expect(item.data).toEqual({
      name: "Jean Paul",
      normalizedName: "jean paul",
      color: "#34d399",
      contrast: true,
      art: {
        kind: "scryfall",
        value: "https://x/y.jpg",
        focal: { x: 0.2, y: 0.3, zoom: 1.5 },
        artist: "A",
      },
    });
    expect(item.updatedAt).toBe(100);
    expect(back).toMatchObject({ isMe: true, lastUsedAt: 5, updatedAt: 777 });
    expect((back.art as { focal: { zoom: number } }).focal.zoom).toBe(1.5);
  });

  it("new remote profiles take the remote zoom (default 1) and lose art when the remote has none", () => {
    const { item } = roundTrip(profileMapper, profile);
    const fresh = profileMapper.fromItem(item, undefined);
    expect((fresh.art as { focal: { zoom: number } }).focal.zoom).toBe(1.5);
    const art = item.data.art as { focal: object };
    const noZoom = profileMapper.fromItem(
      { ...item, data: { ...item.data, art: { ...art, focal: { x: 0.2, y: 0.3 } } } },
      undefined,
    );
    expect((noZoom.art as { focal: { zoom: number } }).focal.zoom).toBe(1);
    const noArt = profileMapper.fromItem({ ...item, data: { ...item.data, art: null } }, profile);
    expect("art" in noArt).toBe(false);
    const bare = profileMapper.fromItem(
      { ...item, data: { name: "Z", color: "#fff", contrast: false, normalizedName: "" } },
      undefined,
    );
    expect(bare.normalizedName).toBe("z");
    const minimal = profileMapper.fromItem(
      { ...item, data: { ...item.data, art: { kind: "solid", value: "#000" } } },
      undefined,
    );
    expect(minimal.art).toEqual({ kind: "solid", value: "#000" });
  });

  it("skips invalid rows and logs why", () => {
    const logs: string[] = [];
    expect(profileMapper.toItem({ ...profile, name: "   " }, (m) => logs.push(m))).toBeNull();
    expect(logs[0]).toMatch(/invalid profile p1/);
    // Non-string colours / clocks degrade to safe defaults rather than blocking sync.
    expect(profileMapper.toItem({ ...profile, color: 5, updatedAt: "x" } as never)).toMatchObject({
      updatedAt: 0,
      data: { color: "" },
    });
  });
});

describe("deckMapper", () => {
  const deck: StoredDeck = {
    id: "d1",
    schemaVersion: 1,
    profileId: "p1",
    name: "Toxrill",
    presetId: "mtg.commander",
    commanders: ["Toxrill, the Corrosive", "", 5 as never],
    colorIdentity: "ubx",
    updatedAt: 9,
  };
  it("maps colour identity letters and the parent profile", () => {
    const { item, back } = roundTrip(deckMapper, deck);
    expect(item.parent).toBe("p1");
    expect(item.data).toEqual({
      name: "Toxrill",
      presetId: "mtg.commander",
      commanders: ["Toxrill, the Corrosive"],
      colorIdentity: ["U", "B"],
    });
    expect(back).toMatchObject({ profileId: "p1", colorIdentity: "UB", presetId: "mtg.commander" });
  });
  it("uses a placeholder preset id for decks without a preset", () => {
    const { item, back } = roundTrip(deckMapper, {
      ...deck,
      presetId: undefined,
      colorIdentity: undefined,
      commanders: undefined as never,
    });
    expect(item.data.presetId).toBe(NO_PRESET);
    expect("presetId" in back).toBe(false);
    expect("colorIdentity" in back).toBe(false);
    expect(back.commanders).toEqual([]);
  });
  // @req PROF-010
  it("round-trips the deck's default background (commander art) and never sends origin", () => {
    const art = {
      kind: "scryfall",
      value: "https://cards.scryfall.io/art_crop/front/a/b/ab.jpg?1",
      focal: { x: 0.5, y: 0.4, zoom: 1 },
      artist: "Victor Adame Minguez",
      cardName: "Atraxa, Praetors' Voice",
    };
    const { item, back } = roundTrip(deckMapper, {
      ...deck,
      commanders: ["Atraxa, Praetors' Voice", "Raised by Giants"],
      art: { ...art, origin: "commander" },
    } as StoredDeck);
    expect(item.data.art).toEqual(art);
    expect(item.data.commanders).toEqual(["Atraxa, Praetors' Voice", "Raised by Giants"]);
    expect(back.art).toEqual(art);
    const p = profileMapper.toItem({ ...profile, art: { ...art, origin: "profile" } } as never);
    expect(p?.data.art).toEqual(art);
  });
  it("rejects decks without a profile", () => {
    expect(deckMapper.toItem({ ...deck, profileId: "" })).toBeNull();
    const orphan = deckMapper.fromItem(
      {
        id: "d",
        updatedAt: 1,
        deleted: false,
        data: { name: "x", presetId: "a", commanders: "x" as never, colorIdentity: ["W"] },
      },
      undefined,
    );
    expect(orphan).toMatchObject({ profileId: "", commanders: [], colorIdentity: "W" });
  });
});

describe("presetMapper", () => {
  const preset: StoredPreset = {
    id: "custom-1",
    schemaVersion: 1,
    preset: { id: "custom-1", name: "My preset", game: "Magic", counters: [] },
    updatedAt: 3,
  };
  it("stores the preset as a JSON payload", () => {
    const { item, back } = roundTrip(presetMapper, preset);
    expect(item.data).toMatchObject({ name: "My preset", game: "Magic", schemaVersion: 1 });
    expect(JSON.parse(item.data.payload as string)).toEqual(preset.preset);
    expect(back).toEqual({ ...preset, updatedAt: 777 });
  });
  it("skips presets without a name", () => {
    expect(presetMapper.toItem({ ...preset, preset: null })).toBeNull();
    expect(
      presetMapper.fromItem({ id: "x", updatedAt: 1, deleted: false, data: {} }, undefined).preset,
    ).toBeNull();
  });
});

// Saved setups ("Presets"; nearest req PROF-010)
describe("setupMapper", () => {
  const setup: StoredSetup = {
    id: "s1",
    schemaVersion: 1,
    name: "Friday pod",
    presetId: "mtg.commander",
    presetName: "MTG Commander",
    config: { startOverrides: { "mtg.life": 60 }, timer: { mode: "bank", seatExtraMs: {} } },
    seats: [
      { name: "Ann", color: "#f472b6", commanders: [], profileId: "p1", clockExtraMs: 60_000 },
      { name: "Ben", color: "#60a5fa", commanders: ["Atraxa"] },
    ],
    firstPlayerRule: "random",
    commanderArt: true,
    order: 2,
    createdAt: 10,
    updatedAt: 20,
    lastUsedAt: 15,
  };
  it("stores the setup as a JSON payload with name, game type and players on top", () => {
    const { item, back } = roundTrip(setupMapper, setup);
    expect(item).toMatchObject({ id: "s1", updatedAt: 20, deleted: false });
    expect(item.data).toMatchObject({
      name: "Friday pod",
      presetId: "mtg.commander",
      players: 2,
      schemaVersion: 1,
    });
    const payload = JSON.parse(item.data.payload as string) as Record<string, unknown>;
    expect(payload).not.toHaveProperty("id");
    expect(payload).not.toHaveProperty("updatedAt");
    expect(payload).toMatchObject({ order: 2, lastUsedAt: 15, seats: setup.seats });
    expect(back).toEqual({ ...setup, updatedAt: 777 });
  });
  it("skips invalid rows and survives unreadable payloads", () => {
    const logs: string[] = [];
    expect(setupMapper.toItem({ ...setup, seats: [] }, (m) => logs.push(m))).toBeNull();
    expect(logs[0]).toMatch(/invalid setup s1/);
    expect(setupMapper.toItem({ ...setup, name: "x".repeat(61) })).toBeNull();
    const row = setupMapper.fromItem(
      { id: "x", updatedAt: 1, deleted: false, data: { payload: "{oops" } },
      undefined,
    );
    expect(row).toEqual({ id: "x", schemaVersion: 1, order: 0, updatedAt: 1 });
    expect(setupMapper.toItem(row)).toBeNull();
    expect(
      setupMapper.fromItem(
        { id: "y", updatedAt: 1, deleted: false, data: { payload: "[1]" } },
        undefined,
      ),
    ).toEqual({ id: "y", schemaVersion: 1, order: 0, updatedAt: 1 });
  });
});

describe("recordMapper", () => {
  const record: StoredRecord = {
    id: "g1",
    schemaVersion: 1,
    presetId: "mtg.commander",
    game: "Magic",
    startedAt: 1000,
    endedAt: 2000,
    durationMs: 1000,
    seats: [{ name: "A", winner: true }],
    localOnlyField: "kept",
  };
  it("syncs records that carry the games/{id} fields", () => {
    const { item, back } = roundTrip(recordMapper, record);
    expect(item.updatedAt).toBe(2000);
    expect(item.data).not.toHaveProperty("localOnlyField");
    expect(back.localOnlyField).toBe("kept");
  });
  it("keeps other record shapes local", () => {
    expect(
      recordMapper.toItem({ id: "x", schemaVersion: 1, endedAt: 1, presetId: "p" }),
    ).toBeNull();
    const fresh = recordMapper.fromItem(
      { id: "g", updatedAt: 1, deleted: false, data: {} },
      undefined,
    );
    expect(fresh).toMatchObject({ id: "g", schemaVersion: 1, endedAt: 0, presetId: "" });
  });
});

describe("artMapper", () => {
  const art: StoredArt = {
    id: "a1",
    blob: new Blob(["x"], { type: "image/webp" }),
    meta: {
      storagePath: "users/u1/art/a1.webp",
      width: 10,
      height: 20,
      bytes: 1000,
      contentType: "image/webp",
      name: "Mine",
      focal: { x: 0.5, y: 0.5, zoom: 2 },
      updatedAt: 50,
      localThing: true,
    },
  };
  it("syncs uploaded art metadata (never the blob)", () => {
    const { item, back } = roundTrip(artMapper, art);
    expect(item.data).toEqual({
      storagePath: "users/u1/art/a1.webp",
      width: 10,
      height: 20,
      bytes: 1000,
      contentType: "image/webp",
      name: "Mine",
      focal: { x: 0.5, y: 0.5, zoom: 2 },
    });
    expect(back.blob).toBe(art.blob);
    expect(back.meta).toMatchObject({ localThing: true, focal: { zoom: 2 } });
  });
  it("local-only art is not synced; remote-only art gets an empty placeholder blob", () => {
    expect(artMapper.toItem({ ...art, meta: { name: "x" } })).toBeNull();
    expect(artMapper.toItem({ ...art, meta: undefined as never })).toBeNull();
    const { item } = roundTrip(artMapper, art);
    const fresh = artMapper.fromItem({ ...item, data: { ...item.data, focal: null } }, undefined);
    expect(fresh.blob.size).toBe(0);
    expect(fresh.meta.remoteOnly).toBe(true);
    expect(fresh.meta).not.toHaveProperty("focal");
    const noZoom = artMapper.fromItem(item, {
      ...art,
      meta: { ...art.meta, focal: { x: 0, y: 0 } },
    });
    expect(noZoom.meta.focal).toEqual({ x: 0.5, y: 0.5, zoom: 2 });
  });
});

describe("settings mapping", () => {
  const rows = [
    {
      key: "app",
      value: {
        theme: "light",
        haptics: false,
        keepAwake: false,
        keepAwakeFallback: true,
        sounds: { taps: true },
        hideSystemBars: false,
      },
      updatedAt: 10,
    },
    { key: "presetDefaults:mtg.commander", value: { players: 4 }, updatedAt: 20 },
    { key: "somethingLocal", value: 1, updatedAt: 99 },
  ];

  // @req SET-014
  it("excludes device-only keys and unsynced rows", () => {
    expect(isDeviceOnlySetting("keepAwakeAnything")).toBe(true);
    expect(isDeviceOnlySetting("theme")).toBe(false);
    expect(syncedAppSettings(null)).toEqual({});
    const item = settingsToItem(rows, "p1");
    expect(item).toMatchObject({ id: "user", updatedAt: 20, deleted: false });
    expect(item.data).toEqual({
      settings: { app: { theme: "light" }, "presetDefaults:mtg.commander": { players: 4 } },
      meProfileId: "p1",
    });
    expect(settingsToItem([], undefined).data).toEqual({ settings: {} });
    expect(isEmptySettingsItem(settingsToItem([], undefined))).toBe(true);
    // An app row holding only device-only values is not synced at all.
    const deviceOnly = settingsToItem(
      [{ key: "app", value: { haptics: true }, updatedAt: 9 }],
      undefined,
    );
    expect(deviceOnly).toMatchObject({ updatedAt: 0, data: { settings: {} } });
    expect(isEmptySettingsItem(settingsToItem([], "p1"))).toBe(false);
    expect(isEmptySettingsItem(item)).toBe(false);
  });

  it("falls back to empty settings when invalid", () => {
    const logs: string[] = [];
    expect(settingsToItem([], "bad id!", (m) => logs.push(m)).data).toEqual({ settings: {} });
    expect(logs).toHaveLength(1);
  });

  it("plans local writes that keep device-only values", () => {
    const remote = settingsToItem(
      [
        { key: "app", value: { theme: "dark", cardLayout: "bigFont" }, updatedAt: 1 },
        { key: "presetDefaults:pokemon", value: { players: 2 }, updatedAt: 1 },
      ],
      "p9",
    );
    const plan = planSettingsApply(
      {
        ...remote,
        updatedAt: 500,
        data: { ...remote.data, settings: { ...(remote.data.settings as object), stray: 1 } },
      },
      rows,
    );
    expect(plan.put).toEqual([
      {
        key: "app",
        value: {
          theme: "dark",
          cardLayout: "bigFont",
          haptics: false,
          keepAwake: false,
          keepAwakeFallback: true,
          sounds: { taps: true },
          hideSystemBars: false,
        },
        updatedAt: 500,
      },
      { key: "presetDefaults:pokemon", value: { players: 2 }, updatedAt: 500 },
    ]);
    expect(plan.delete).toEqual(["presetDefaults:mtg.commander"]);
    expect(plan.meProfileId).toBe("p9");
    const empty = planSettingsApply(
      { id: "user", updatedAt: 1, deleted: false, data: { settings: { app: { theme: "x" } } } },
      [],
    );
    expect(empty.put[0]?.value).toEqual({ theme: "x" });
    expect(empty.meProfileId).toBeUndefined();
    expect(
      planSettingsApply({ id: "user", updatedAt: 1, deleted: false, data: {} }, []).put,
    ).toEqual([]);
  });
});
