// @req ART-006 @req ART-009
// jsdom environment: IndexedDB comes from fake-indexeddb (tests/setup/vitest.setup.ts).
import Dexie from "dexie";
import { afterEach, describe, expect, it } from "vitest";
import { SCRYFALL_CACHE_DB_NAME, createIndexedDbCache, createMemoryCache } from "./cache";

describe("createMemoryCache", () => {
  it("stores values with storedAt and evicts the oldest beyond maxEntries", async () => {
    let t = 10;
    const c = createMemoryCache({ now: () => t, maxEntries: 2 });
    await c.set("a", 1);
    t = 20;
    await c.set("b", 2);
    t = 30;
    await c.set("a", 11); // re-set refreshes recency
    await c.set("c", 3);
    expect(await c.get("b")).toBeUndefined();
    expect(await c.get("a")).toEqual({ value: 11, storedAt: 30 });
    expect(await c.count()).toBe(2);
    await c.delete("a");
    expect(await c.get("a")).toBeUndefined();
    await c.clear();
    expect(await c.count()).toBe(0);
  });

  it("defaults to Date.now", async () => {
    const c = createMemoryCache();
    await c.set("k", "v");
    const e = await c.get("k");
    expect(Math.abs(e!.storedAt - Date.now())).toBeLessThan(1000);
  });
});

describe("createIndexedDbCache", () => {
  const opened: { close(): void }[] = [];
  afterEach(async () => {
    for (const c of opened.splice(0)) c.close();
    await Dexie.delete("scryfall-cache-test");
    await Dexie.delete(SCRYFALL_CACHE_DB_NAME);
  });

  it("persists entries in its own Dexie DB across instances", async () => {
    let t = 1000;
    const a = createIndexedDbCache({ dbName: "scryfall-cache-test", now: () => t });
    opened.push(a);
    await a.set("https://api.scryfall.com/symbology", { object: "list", data: [] });
    a.close();
    const b = createIndexedDbCache({ dbName: "scryfall-cache-test", now: () => t });
    opened.push(b);
    expect(await b.get("https://api.scryfall.com/symbology")).toEqual({
      value: { object: "list", data: [] },
      storedAt: 1000,
    });
    expect(await b.get("missing")).toBeUndefined();
    t = 2000;
    await b.set("x", 1);
    expect(await b.count()).toBe(2);
    expect(await b.prune(1500)).toBe(1);
    expect(await b.count()).toBe(1);
    await b.delete("x");
    expect(await b.count()).toBe(0);
    await b.set("y", 2);
    await b.clear();
    expect(await b.count()).toBe(0);
  });

  it("prunes the oldest entries beyond maxEntries", async () => {
    let t = 0;
    const c = createIndexedDbCache({ dbName: "scryfall-cache-test", now: () => t, maxEntries: 2 });
    opened.push(c);
    for (const k of ["a", "b", "c"]) {
      t += 10;
      await c.set(k, k);
    }
    expect(await c.count()).toBe(2);
    expect(await c.get("a")).toBeUndefined();
    expect((await c.get("c"))?.value).toBe("c");
  });

  it("uses the dedicated tcg-life-scryfall-cache DB by default", async () => {
    const c = createIndexedDbCache();
    opened.push(c);
    await c.set("k", "v");
    expect(await Dexie.exists(SCRYFALL_CACHE_DB_NAME)).toBe(true);
    expect(SCRYFALL_CACHE_DB_NAME).toBe("tcg-life-scryfall-cache");
  });
});
