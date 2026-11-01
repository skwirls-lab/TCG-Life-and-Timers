// Offline art (T5.5): chosen art survives an offline reload (IndexedDB copy + SW image cache).
// @req ART-009 @req PWA-002 @req ART-006
import { expect, test } from "@playwright/test";
import { routeScryfall } from "./support/artRoutes";

const SOL_C13 =
  "https://cards.scryfall.io/art_crop/front/f/e/fe368d57-c70a-41b1-ab69-629ffa91da67.jpg?1700000000";

test.describe("offline art", () => {
  // @req ART-009 @req PWA-002 @req ART-006
  test("art chosen online still shows after an offline reload", async ({ page, context }) => {
    test.setTimeout(90_000);
    await routeScryfall(context);
    await page.goto("/play?quick=mtg.commander&players=4&seed=7&names=Conner,Josh,JP,Bethany");
    await expect(page.getByTestId("board")).toBeVisible();
    // Wait until the service worker controls the page (so image fetches go through it).
    await page.waitForFunction(() => !!navigator.serviceWorker?.controller, undefined, {
      timeout: 30_000,
    });

    await page.getByTestId("seat-0-name").click();
    await expect(page.getByTestId("seat-menu")).toBeVisible();
    await page.getByTestId("art-search-open").click();
    await page.getByTestId("art-search-input").pressSequentially("Sol", { delay: 40 });
    await page.getByTestId("art-suggestion-0").click();
    await page.getByTestId("art-print-1").click();
    await page.getByTestId("art-focal-save").click();
    await page.getByTestId("art-done").click();

    // The chosen image is copied into IndexedDB (ART-009) and the game is saved.
    await expect
      .poll(
        () =>
          page.evaluate(async () => {
            const db = await new Promise<IDBDatabase>((resolve, reject) => {
              const r = indexedDB.open("tcg-life");
              r.onsuccess = () => resolve(r.result);
              r.onerror = () => reject(r.error);
            });
            const get = <T>(store: string) =>
              new Promise<T[]>((resolve, reject) => {
                const r = db.transaction(store, "readonly").objectStore(store).getAll();
                r.onsuccess = () => resolve(r.result as T[]);
                r.onerror = () => reject(r.error);
              });
            const art = await get<{ meta: { source?: string; url?: string }; blob: Blob }>("art");
            const games = await get<{ game: { seats: { art?: { value: string } }[] } }>("games");
            db.close();
            return {
              copy: art.some((a) => a.meta.source === "scryfall" && a.blob.size > 0),
              saved: games.some((g) => g.game.seats[0]?.art?.value?.includes("fe368d57")),
            };
          }),
        { timeout: 15_000 },
      )
      .toEqual({ copy: true, saved: true });
    // The service worker cached the image too (cache-first, ART-006).
    await expect
      .poll(() =>
        page.evaluate(async (url) => {
          const cache = await caches.open("scryfall-images");
          return !!(await cache.match(url));
        }, SOL_C13),
      )
      .toBe(true);

    // Visit /play once while controlled (the SW caches the page), then reload it offline.
    await page.goto("/play");
    await expect(page.getByTestId("board")).toBeVisible();
    await context.setOffline(true);
    await page.reload();
    await expect(page.getByTestId("board")).toBeVisible();
    await page.getByTestId("seat-0-name").click();
    const preview = page.getByTestId("art-current-preview");
    await expect(preview).toHaveAttribute("data-art-kind", "scryfall");
    await expect(preview).toHaveAttribute("data-art-src", "copy");
    const loaded = await preview.locator("[data-art-layer]").evaluate(async (el) => {
      const m = /url\("?(.*?)"?\)/.exec(getComputedStyle(el).backgroundImage);
      if (!m?.[1]) return null;
      const img = new Image();
      img.src = m[1];
      await img.decode();
      return { scheme: m[1].split(":")[0], width: img.naturalWidth };
    });
    expect(loaded).toEqual({ scheme: "blob", width: 488 });
    await expect(page.getByTestId("art-credit")).toHaveText("Art: Mike Bierek");
    // Search is unavailable offline (ART-009).
    await page.getByTestId("art-search-open").click();
    await expect(page.getByTestId("art-offline")).toBeVisible();
    await context.setOffline(false);
  });
});
