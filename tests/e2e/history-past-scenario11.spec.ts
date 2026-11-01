// @req HIST-003 @req HIST-030 @req HIST-031 @req HIST-032 @req HIST-033 @req HIST-034
// @req HIST-021 @req HIST-023 @req HIST-006 @req A11Y-002
/**
 * Appendix B Scenario 11 (as far as possible without the board wiring): three games played through
 * the store on the history harness — a clear winner; a reset mid-game where the "Who won?" prompt
 * picks the winner; one left idle for 2 hours before finishing.
 */
import { expect, test } from "@playwright/test";
import { expectNoSeriousA11yViolations } from "./support/axe";
import { dispatch, downloadText, expectRecords, gameId, life, seatIds } from "./support/records";

test.use({ timezoneId: "UTC" });

test("Scenario 11: history and stats", async ({ page }) => {
  await page.clock.install({ time: new Date("2026-10-01T18:00:00Z") });
  await page.goto("/dev/history?quick=mtg.commander&players=4&names=Ana,Ben,Cy&seed=7");
  await expect(page.getByTestId("harness-ready")).toHaveText("ready");
  await expect(page.getByTestId("past-empty")).toBeVisible();
  const [ana, ben, cy, p4] = await seatIds(page);

  // Game 1 — clear winner (Ana, who goes first). Profiles and decks on the seats.
  await dispatch(
    page,
    { type: "SEAT_SET_PROFILE", seatId: ana!, profileId: "p-ana", deckName: "Toxrill" },
    { type: "SEAT_SET_PROFILE", seatId: ben!, deckName: "Krenko" },
    { type: "SET_FIRST_PLAYER", seatId: ana! },
  );
  await page.clock.fastForward(60_000);
  await dispatch(page, life(ben!, -40), life(cy!, -40), life(p4!, -40));
  await expectRecords(page, 1);
  const first = await gameId(page);
  await page.getByTestId("harness-reset").click(); // already recorded → no prompt
  await expect(page.getByTestId("who-won")).toHaveCount(0);
  await expect.poll(() => gameId(page)).not.toBe(first);

  // Game 2 — reset mid-game: "Who won?" picks Ana (Ben went first → Ana is position 4).
  await dispatch(page, { type: "SET_FIRST_PLAYER", seatId: ben! });
  await page.clock.fastForward(30_000);
  await dispatch(page, life(ana!, -5), life(ben!, -7), life(cy!, -3));
  await page.getByTestId("harness-reset").click();
  const prompt = page.getByTestId("who-won");
  await expect(prompt).toBeVisible();
  await expectNoSeriousA11yViolations(page);
  await prompt.getByTestId(`who-won-seat-${ana}`).click();
  await expectRecords(page, 2);

  // Game 3 — Ben now plays with a profile; left idle 2 h before finishing; Cy (first) wins.
  await dispatch(
    page,
    { type: "SET_FIRST_PLAYER", seatId: cy! },
    { type: "SEAT_SET_PROFILE", seatId: ben!, profileId: "p-ben", deckName: "Krenko" },
  );
  await dispatch(page, life(ana!, -1));
  await page.clock.fastForward(60_000);
  await dispatch(page, life(ben!, -2));
  await page.clock.fastForward("02:00:00");
  await dispatch(page, life(ana!, -39), life(ben!, -38), life(p4!, -40));
  await expectRecords(page, 3);

  // Past Games shows 3 games; the idle game's duration excludes the gap.
  const cards = page.getByTestId("game-card");
  await expect(cards).toHaveCount(3);
  await expect(cards.nth(0).getByTestId("game-card-winner")).toHaveText("Winner Cy");
  await expect(cards.nth(1).getByTestId("game-card-winner")).toHaveText("Winner Ana");
  await expect(cards.nth(0).getByTestId("game-card-duration")).toHaveText("1 min");
  await cards.nth(0).click();
  await expect(page.getByTestId("past-game-duration")).toHaveText(
    "Active 1 min · Wall clock 2 h 01 min",
  );
  await expect(page.getByTestId("past-log").getByTestId("past-log-row").first()).toBeVisible();
  await expectNoSeriousA11yViolations(page);
  await page.getByTestId("past-view-chart").click();
  await expect(page.getByTestId("past-log-section").locator("svg").first()).toBeVisible();
  await page.getByTestId("past-back").click();

  // Players: W/L, no "Player N" rows; two "Ben" identities (name-only and profile).
  await page.getByTestId("past-tabs-players").click();
  const rows = page.getByTestId("player-row");
  await expect(rows).toHaveCount(4);
  await expect(page.getByTestId("past-players")).not.toContainText("Player 4");
  await expect(page.locator('[data-identity="p:p-ana"]').getByTestId("player-wl")).toHaveText(
    "2 W · 1 L",
  );
  await expect(page.locator('[data-identity="n:cy"]').getByTestId("player-wl")).toHaveText(
    "1 W · 2 L",
  );
  await expect(page.getByTestId("player-name").filter({ hasText: "Ben" })).toHaveCount(2);

  // Merge the two Ben rows (name-only into the profile): records combine; Undo is offered.
  await page.locator('[data-identity="n:ben"]').getByTestId("player-actions").click();
  await expectNoSeriousA11yViolations(page);
  await page.getByTestId("identity-merge").click();
  await page.locator('[data-testid="merge-target"][data-identity="p:p-ben"]').click();
  await expect(page.getByTestId("snackbar")).toContainText("Merged Ben into Ben");
  await expect(rows).toHaveCount(3);
  await expect(page.locator('[data-identity="p:p-ben"]').getByTestId("player-wl")).toHaveText(
    "0 W · 3 L",
  );

  // Insights: turn-order advantage (positions 1, 4, 1 won).
  await page.getByTestId("past-tabs-insights").click();
  await expect(page.getByTestId("ins-games")).toHaveText("3");
  await expect(page.getByTestId("ins-position-1")).toContainText("2/3 · 67%");
  await expect(page.getByTestId("ins-position-2")).toContainText("0/3 · 0%");
  await expect(page.getByTestId("ins-position-4")).toContainText("1/3 · 33%");

  // CSV export: one row per game-seat (3 games × 4 seats).
  await page.getByTestId("past-export").click();
  const [csv] = await Promise.all([
    page.waitForEvent("download"),
    page.getByTestId("export-csv").click(),
  ]);
  const lines = (await downloadText(csv)).trimEnd().split("\r\n");
  expect(lines).toHaveLength(1 + 12);
  expect(lines.filter((l) => l.includes(",Ben,p:p-ben,"))).toHaveLength(3);
  await page.getByTestId("export-sheet-close").click();

  // Rematch with the same setup (game 1) → a new game on the board with the same seats.
  await page.getByTestId("past-tabs-games").click();
  await cards.nth(2).click();
  await page.getByTestId("past-rematch").click();
  await expect(page).toHaveURL(/\/play/);
  await expect
    .poll(() =>
      page.evaluate(() => {
        const g = window.__tcg?.getState().session?.game;
        return g ? `${g.status}:${g.seats.map((s) => s.name).join(",")}` : "";
      }),
    )
    .toBe("ready:Ana,Ben,Cy,Player 4");
});

test("trivial games are discarded and 'Don't save' keeps nothing (HIST-032, HIST-031)", async ({
  page,
}) => {
  await page.goto("/dev/history?quick=mtg.commander&players=2&names=Ana,Ben&seed=3");
  await expect(page.getByTestId("harness-ready")).toHaveText("ready");
  const [ana, ben] = await seatIds(page);
  const g1 = await gameId(page);
  await page.getByTestId("harness-reset").click(); // nothing happened → discarded, no prompt
  await expect.poll(() => gameId(page)).not.toBe(g1);
  await dispatch(page, life(ana!, -1), life(ben!, -1), life(ana!, -1));
  await page.getByTestId("harness-reset").click();
  await page.getByTestId("who-won-discard").click();
  await expectRecords(page, 0);
  await expect(page.getByTestId("past-empty")).toBeVisible();
});
