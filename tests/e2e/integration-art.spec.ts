// Board-level seat art (INTEGRATE-B): SeatTile renders ArtBackground, so uploads (Dexie blobs)
// and Scryfall art show on the real board and survive a reload. Scryfall is intercepted.
// @req ART-003 @req ART-020 @req ART-022 @req LAY-007 @req PROF-010 @req CMD-003
import { expect, test, type Page } from "@playwright/test";
import { artJpeg, routeScryfall } from "./support/artRoutes";

const BASE = "/play?quick=mtg.commander&players=4&seed=7&names=Conner,Josh,JP,Bethany";

async function openSeat(page: Page, i: number) {
  await page.getByTestId(`seat-${i}-name`).click();
  await expect(page.getByTestId("seat-menu")).toBeVisible();
}

function commanders(page: Page, i: number): Promise<string[] | undefined> {
  return page.evaluate((idx) => window.__tcg?.getState().session?.game.seats[idx]?.commanders, i);
}

/** Art kind of seat i in the autosaved active game (raw IndexedDB). */
function storedArtKind(page: Page, i: number): Promise<string | null> {
  return page.evaluate(async (idx) => {
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const req = indexedDB.open("tcg-life");
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
    const rows = await new Promise<{ game?: { seats?: { art?: { kind: string } }[] } }[]>(
      (resolve, reject) => {
        const req = db.transaction("games", "readonly").objectStore("games").getAll();
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
      },
    );
    db.close();
    return rows[0]?.game?.seats?.[idx]?.art?.kind ?? null;
  }, i);
}

test.describe("seat art on the board", () => {
  // @req ART-020 @req ART-022 @req LAY-007
  test("an uploaded image shows on the board tile and survives a reload", async ({ page }) => {
    await page.goto(BASE);
    const tile = page.getByTestId("seat-0-art");
    await expect(tile).toHaveAttribute("data-art-kind", "default");
    await openSeat(page, 0);
    await page
      .getByTestId("art-upload-input")
      .setInputFiles({ name: "dragon.jpg", mimeType: "image/jpeg", buffer: await artJpeg() });
    await page.getByTestId("art-focal-save").click();
    await page.getByTestId("seat-menu-close").click();
    await expect(page.getByTestId("seat-menu")).toHaveCount(0);

    await expect(tile).toHaveAttribute("data-art-kind", "upload");
    await expect(tile).toHaveAttribute("data-art-src", "blob");
    await expect(tile.locator("[data-art-layer]")).toHaveCSS("background-image", /^url\("blob:/);
    // other seats keep their default background
    await expect(page.getByTestId("seat-1-art")).toHaveAttribute("data-art-src", "none");

    // the autosave has stored the seat art before we reload
    await expect.poll(() => storedArtKind(page, 0)).toBe("upload");
    await page.goto("/play");
    await expect(page.getByTestId("seat-0-art")).toHaveAttribute("data-art-kind", "upload");
    await expect(page.getByTestId("seat-0-art")).toHaveAttribute("data-art-src", "blob");
    await expect(page.getByTestId("seat-0-art").locator("[data-art-layer]")).toHaveCSS(
      "background-image",
      /^url\("blob:/,
    );
  });

  // @req ART-003 @req PROF-010 @req CMD-003
  test("Use as commander updates the commander input; blurring it keeps the commander", async ({
    page,
    context,
  }) => {
    await routeScryfall(context);
    await page.goto(BASE);
    await openSeat(page, 1);
    const input = page.getByTestId("seat-commander-0");
    await expect(input).toHaveValue("");
    await page.getByTestId("art-search-open").click();
    await page.getByTestId("art-search-input").pressSequentially("Sol", { delay: 40 });
    await page.getByTestId("art-suggestion-0").click();
    await page.getByTestId("art-print-1").click();
    await page.getByTestId("art-focal-save").click();
    await page.getByTestId("art-use-commander").click();
    await expect.poll(() => commanders(page, 1)).toEqual(["Sol Ring"]);

    // the (previously stale) input follows; focusing and leaving it must not revert the change
    await expect(input).toHaveValue("Sol Ring");
    await input.focus();
    await input.blur();
    expect(await commanders(page, 1)).toEqual(["Sol Ring"]);

    await page.getByTestId("seat-menu-close").click();
    await expect(page.getByTestId("seat-1-art")).toHaveAttribute("data-art-kind", "scryfall");
    await expect(page.getByTestId("seat-1-art")).toHaveAttribute("data-art-src", /^(copy|remote)$/);
  });
});
