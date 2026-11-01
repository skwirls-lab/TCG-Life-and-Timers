/** Past Games e2e helpers: the fixture loader (/dev/history) and store access. */
import { expect, type Download, type Page } from "@playwright/test";
import { readFile } from "node:fs/promises";

/** Open the history harness, replacing the stored records with the 26 stats fixtures. */
export async function seedFixtures(page: Page, query = ""): Promise<void> {
  await page.goto(`/dev/history?fixtures=1${query}`);
  await expect(page.getByTestId("harness-ready")).toHaveText("ready");
  await expect(page.getByTestId("harness-records")).toHaveText("26");
}

type Action = Record<string, unknown> & { type: string };

/** Dispatch engine actions through the test hook. */
export async function dispatch(page: Page, ...actions: Action[]): Promise<void> {
  await page.evaluate((list) => {
    for (const a of list) window.__tcg!.dispatch(a as never);
  }, actions);
}

/** Seat ids of the current game, in seat order. */
export async function seatIds(page: Page): Promise<string[]> {
  return page.evaluate(() => window.__tcg!.getState().session!.game.seats.map((s) => s.id));
}

export async function gameId(page: Page): Promise<string> {
  return page.evaluate(() => window.__tcg!.getState().session!.game.id);
}

/** Wait until queued record saves are done and the harness shows `count` records. */
export async function expectRecords(page: Page, count: number): Promise<void> {
  await page.evaluate(() => window.__tcgRecordsIdle?.());
  await expect(page.getByTestId("harness-records")).toHaveText(String(count));
}

export async function downloadText(download: Download): Promise<string> {
  const path = await download.path();
  return readFile(path, "utf8");
}

export const life = (seatId: string, delta: number): Action => ({
  type: "COUNTER_ADD",
  counterId: "mtg.life",
  seatId,
  delta,
});
