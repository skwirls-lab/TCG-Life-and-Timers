// @req HIST-001 @req HIST-002 @req HIST-010 @req HIST-011 @req HIST-012 @req HIST-013 @req A11Y-002
import { expect, test, type Page } from "@playwright/test";
import { expectNoSeriousA11yViolations } from "./support/axe";

const QUICK = "quick=mtg.commander&players=4&seed=7&names=Conner,Josh,JP,Bethany";

async function ids(page: Page): Promise<Record<string, string>> {
  return page.evaluate(() =>
    Object.fromEntries(window.__tcg!.getState().session!.game.seats.map((s) => [s.name, s.id])),
  );
}

/** Scenario-1-like actions: Josh −3 life, then 5 commander damage Conner → JP, then a d20 roll. */
async function setup(page: Page) {
  await page.goto(`/history?${QUICK}`);
  await expect(page.getByTestId("history-current")).toBeVisible();
  const s = await ids(page);
  await page.evaluate((s) => {
    const d = window.__tcg!.dispatch;
    d({ type: "COUNTER_ADD", counterId: "mtg.life", seatId: s.Josh!, delta: -3 });
    d({
      type: "CMD_DAMAGE_ADD",
      targetSeatId: s.JP!,
      sourceSeatId: s.Conner!,
      sourceIndex: 0,
      delta: 5,
    });
    d({
      type: "LOG_NOTE",
      kind: "dice",
      text: "d20: 14",
      meta: { sides: 20, count: 1, values: "14", total: 14 },
    });
  }, s);
  return s;
}

test("log rows show the expected texts, colors and the grouped linked pair", async ({ page }) => {
  const s = await setup(page);
  await expect(page.getByTestId("history-header")).toContainText("4 players");
  await expect(page.getByTestId("history-start-value")).toContainText("Starting Life 40");
  await expect(page.getByTestId("history-header")).toContainText("Commander");

  // Standings: JP 35 and Josh 37 below the 40s.
  await expect(page.getByTestId(`standing-${s.JP}-value`)).toHaveText("35");
  await expect(page.getByTestId(`standing-${s.Josh}-value`)).toHaveText("37");

  const groups = page.getByTestId("log-list").locator("> li");
  // Newest first: dice row, then the commander-damage group, then Josh's life loss.
  await expect(groups.nth(0)).toContainText("Rolled d20: 14");
  const linked = groups.nth(1);
  await expect(linked).toHaveAttribute("data-testid", "log-group-linked");
  const rows = linked.getByTestId("log-row");
  await expect(rows).toHaveCount(2);
  await expect(rows.nth(0).getByTestId("log-row-label")).toHaveText("Conner → JP");
  await expect(rows.nth(0).getByTestId("log-row-chip")).toHaveText("+5");
  await expect(rows.nth(0).getByTestId("log-row-chip")).toHaveAttribute("data-tone", "commander");
  await expect(rows.nth(0).getByTestId("log-row-value")).toHaveText("→ 5");
  await expect(rows.nth(1).getByTestId("log-row-label")).toHaveText("JP");
  await expect(rows.nth(1).getByTestId("log-row-chip")).toHaveText("−5");
  await expect(rows.nth(1).getByTestId("log-row-value")).toHaveText("→ 35");

  const josh = groups.nth(2);
  await expect(josh.getByTestId("log-row-label")).toHaveText("Josh");
  const chip = josh.getByTestId("log-row-chip");
  await expect(chip).toHaveText("−3");
  await expect(chip).toHaveAttribute("data-tone", "loss");
  // Life loss is red (--color-danger), commander damage orange (--color-commander).
  expect(await chip.evaluate((e) => getComputedStyle(e).backgroundColor)).toBe("rgb(244, 63, 94)");
  expect(
    await rows
      .nth(0)
      .getByTestId("log-row-chip")
      .evaluate((e) => getComputedStyle(e).backgroundColor),
  ).toBe("rgb(245, 158, 11)");

  // Tap a row → its time; filter by seat from the standings.
  const total = await groups.count();
  await josh.getByTestId("log-row").getByRole("button").first().click();
  await expect(josh.getByTestId("log-row-time")).toBeVisible();
  await page.getByTestId(`standing-${s.Josh}`).click();
  await expect(page.getByTestId("log-list")).not.toContainText("Conner → JP");
  await expect(page.getByTestId("log-list")).toContainText("Josh");
  await page.getByTestId("history-clear-filter").click();
  await expect(groups).toHaveCount(total);
  await expectNoSeriousA11yViolations(page);
});

test("chart toggle renders an svg with one line per seat", async ({ page }) => {
  const s = await setup(page);
  await page.evaluate(
    (s) =>
      window.__tcg!.dispatch({
        type: "COUNTER_ADD",
        counterId: "mtg.life",
        seatId: s.Bethany!,
        delta: -40,
      }),
    s,
  );
  await page.getByTestId("history-view-chart").click();
  const svg = page.getByTestId("life-chart-svg");
  await expect(svg).toBeVisible();
  await expect(svg.getByTestId("chart-line")).toHaveCount(4);
  await expect(svg.getByTestId("chart-skull")).toHaveCount(1);
  await expect(page.getByTestId("life-chart-table")).toContainText("Bethany");
  const box = await svg.boundingBox();
  const vw = page.viewportSize()!.width;
  expect(box!.width).toBeLessThanOrEqual(vw);
  await expectNoSeriousA11yViolations(page);
});

test("undo to here reverts that change and everything after it", async ({ page }) => {
  const s = await setup(page);
  const linked = page.getByTestId("log-group-linked");
  await linked.getByTestId("log-row").first().getByRole("button").first().click();
  await linked.getByTestId("log-row-undo").click();
  const sheet = page.getByTestId("undo-to-sheet");
  await expect(sheet).toContainText("Undo this change and everything after it?");
  await page.getByTestId("undo-to-confirm").click();
  await expect(sheet).toBeHidden();

  await expect(page.getByTestId(`standing-${s.JP}-value`)).toHaveText("40");
  await expect(page.getByTestId(`standing-${s.Josh}-value`)).toHaveText("37");
  await expect(page.getByTestId("log-group-linked")).toHaveCount(0);
  // Undone events (commander damage + life + dice) are listed struck-through at the top.
  await expect(page.getByTestId("log-undone-row")).toHaveCount(3);
  await expect(page.getByTestId("log-undone")).toContainText("Conner → JP");
  const state = await page.evaluate(() => {
    const g = window.__tcg!.getState().session!.game;
    return g.log.filter((e) => e.kind === "counter").length;
  });
  expect(state).toBe(1);
});

test("long-press a row opens undo to here", async ({ page }) => {
  await setup(page);
  const row = page.getByTestId("log-list").locator("> li").last().getByRole("button").first();
  await row.scrollIntoViewIfNeeded();
  const box = (await row.boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await expect(page.getByTestId("undo-to-sheet")).toBeVisible();
  await page.mouse.up();
  await page.getByTestId("undo-to-cancel").click();
  await expect(page.getByTestId("undo-to-sheet")).toBeHidden();
});

test("empty state without a game and an empty Past Games list", async ({ page }) => {
  await page.goto("/history");
  await expect(page.getByTestId("history-empty")).toContainText("No game in progress");
  await page.getByTestId("history-segment-past").click();
  await expect(page.getByTestId("past-games")).toContainText("No past games yet");
  await expectNoSeriousA11yViolations(page);
});
