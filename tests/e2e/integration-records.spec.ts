// Board-level game records (INTEGRATE-B): the record keeper and the Who-won flow are mounted
// app-wide, so real reset / new-game paths save games without any dev harness.
// @req HIST-003 @req HIST-008 @req HIST-031 @req HIST-020
import { expect, test, type Page } from "@playwright/test";
import { menuTap, openMenu } from "./support/menu";
import { dispatch, gameId, life } from "./support/records";

const BASE = "/play?quick=mtg.commander&seed=7&s.hideSystemBars=0";

interface Rec {
  id: string;
  winners?: string[];
  outcome?: string;
}

/** Rows of the app's Dexie `records` table (raw IndexedDB). */
async function readRecords(page: Page): Promise<Rec[]> {
  return page.evaluate(async () => {
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const req = indexedDB.open("tcg-life");
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
    const rows = await new Promise<Rec[]>((resolve, reject) => {
      const req = db.transaction("records", "readonly").objectStore("records").getAll();
      req.onsuccess = () => resolve(req.result as Rec[]);
      req.onerror = () => reject(req.error);
    });
    db.close();
    return rows.map((r) => ({ id: r.id, winners: r.winners, outcome: r.outcome }));
  });
}

async function holdOn(page: Page, testId: string, until: () => Promise<void>) {
  const box = (await page.getByTestId(testId).boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  try {
    await until();
  } finally {
    await page.mouse.up();
  }
}

test.describe("game records on the board", () => {
  // @req HIST-003 @req HIST-020
  test("a game played to a win on /play is listed in Past Games", async ({ page }) => {
    await page.goto(`${BASE}&players=2&names=Ana,Ben`);
    await expect(page.getByTestId("seat-1-name")).toHaveText("Ben");
    const id = await gameId(page);
    // a few real taps, then the finishing blow
    await page.getByTestId("seat-1-minus").click();
    await page.getByTestId("seat-1-minus").click();
    await expect(page.getByTestId("seat-1-value")).toHaveText("38");
    await dispatch(page, life("s2", -38));
    await expect(page.getByTestId("game-over")).toBeVisible();
    await expect
      .poll(async () => (await readRecords(page)).find((r) => r.id === id)?.winners)
      .toEqual(["s1"]);

    await page.goto("/history");
    await page.getByTestId("history-segment-past").click();
    const card = page.locator(`[data-testid="game-card"][data-game-id="${id}"]`);
    await expect(card).toBeVisible();
    await expect(card.getByTestId("game-card-winner")).toHaveText("Winner Ana");
  });

  // @req HIST-031
  test("hold-reset mid-game asks Who won?, saves that winner, then resets", async ({ page }) => {
    await page.goto(`${BASE}&players=4&names=Conner,Josh,JP,Bethany`);
    await expect(page.getByTestId("seat-0-name")).toBeVisible();
    const id = await gameId(page);
    await dispatch(page, life("s1", -5), life("s2", -3), life("s3", -7));
    await expect(page.getByTestId("seat-0-value")).toHaveText("35");

    await openMenu(page);
    await holdOn(page, "toolbar-reset", () =>
      expect(page.getByTestId("who-won")).toBeVisible({ timeout: 3000 }),
    );
    // the prompt holds the reset: nothing has changed yet
    await expect(page.getByTestId("seat-0-value")).toHaveText("35");
    await page.getByTestId("who-won-seat-s3").click();
    await expect(page.getByTestId("who-won")).toHaveCount(0);
    await expect(page.getByTestId("seat-0-value")).toHaveText("40");
    expect(await gameId(page)).not.toBe(id);
    await expect
      .poll(async () => (await readRecords(page)).find((r) => r.id === id)?.winners)
      .toEqual(["s3"]);
  });

  // @req HIST-031
  test("closing the Who-won prompt cancels the reset", async ({ page }) => {
    await page.goto(`${BASE}&players=4&names=Conner,Josh,JP,Bethany&s.confirmStyle=dialog`);
    await expect(page.getByTestId("seat-0-name")).toBeVisible();
    const id = await gameId(page);
    await dispatch(page, life("s1", -1), life("s2", -1), life("s3", -1));
    await menuTap(page, "toolbar-reset");
    await page.getByTestId("reset-confirm").click();
    await expect(page.getByTestId("who-won")).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(page.getByTestId("who-won")).toHaveCount(0);
    await expect(page.getByTestId("seat-0-value")).toHaveText("39");
    expect(await gameId(page)).toBe(id);
    expect(await readRecords(page)).toEqual([]);
  });

  // @req HIST-031
  test("changing the player count goes through Who won? too", async ({ page }) => {
    await page.goto(`${BASE}&players=4&names=Conner,Josh,JP,Bethany&s.confirmStyle=dialog`);
    await expect(page.getByTestId("seat-0-name")).toBeVisible();
    const id = await gameId(page);
    await dispatch(page, life("s1", -1), life("s2", -1), life("s3", -1));
    await menuTap(page, "toolbar-players");
    await page.getByTestId("players-count-3").click();
    await page.getByTestId("players-confirm").click();
    await page.getByTestId("who-won-draw").click();
    await expect(page.getByTestId("seat-3")).toHaveCount(0);
    await expect
      .poll(async () => (await readRecords(page)).find((r) => r.id === id)?.outcome)
      .toBe("draw");
  });

  // @req HIST-008
  test("with game history off: no history button and no record", async ({ page }) => {
    await page.goto(`${BASE}&players=2&names=Ana,Ben`);
    await openMenu(page);
    await expect(page.getByTestId("toolbar-history")).toBeVisible();
    await dispatch(page, { type: "SET_OPTION", key: "historyEnabled", value: false });
    await expect(page.getByTestId("toolbar-history")).toHaveCount(0);
    await dispatch(page, life("s1", -1), life("s2", -1), life("s1", -1));
    // a reset neither prompts nor saves
    await openMenu(page);
    await holdOn(page, "toolbar-reset", () =>
      expect(page.getByTestId("seat-0-value")).toHaveText("40", { timeout: 3000 }),
    );
    await expect(page.getByTestId("who-won")).toHaveCount(0);
    // a finished game is not saved either
    await dispatch(page, life("s2", -40));
    await expect(page.getByTestId("game-over")).toBeVisible();
    await page.waitForTimeout(250);
    expect(await readRecords(page)).toEqual([]);
  });
});
