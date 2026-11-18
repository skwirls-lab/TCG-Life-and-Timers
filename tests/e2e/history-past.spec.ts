// @req HIST-003 @req HIST-020 @req HIST-021 @req HIST-022 @req HIST-023 @req HIST-024
// @req HIST-006 @req HIST-033 @req HIST-035 @req A11Y-002
import { expect, test } from "@playwright/test";
import { expectNoSeriousA11yViolations } from "./support/axe";
import { downloadText, seedFixtures } from "./support/records";

test.describe("Past Games with the 26 stats fixtures", () => {
  test.beforeEach(async ({ page }) => {
    await seedFixtures(page);
  });

  test("games list, game detail, edit and delete", async ({ page }) => {
    const cards = page.getByTestId("game-card");
    await expect(cards).toHaveCount(26);
    // Newest first: d2 is game 26, won by Ben (accent bar + trophy).
    await expect(cards.first()).toContainText("Game 26");
    await expect(cards.first().getByTestId("game-card-winner")).toHaveText("Winner Ben");
    await expect(cards.first().getByTestId("game-card-duration")).toHaveText("40 min");
    // b8 (game 20) has no winner.
    const b8 = page.locator('[data-game-id="b8"]');
    await expect(b8.getByTestId("game-card-winner")).toHaveText("No winner");
    await expectNoSeriousA11yViolations(page);

    // Open d1 (game 25): standings, no log for the fixture (compact summary).
    await page.locator('[data-game-id="d1"]').click();
    const detail = page.getByTestId("past-game-detail");
    await expect(detail.getByTestId("past-game-title")).toHaveText("Game 25");
    await expect(detail.getByTestId("past-game-outcome")).toContainText("Winner Declan");
    await expect(detail.getByTestId("past-standing")).toHaveCount(3);
    await expect(detail.getByTestId("past-standing").first()).toContainText("Declan");
    await expect(detail.getByTestId("past-no-log")).toBeVisible();
    await expectNoSeriousA11yViolations(page);

    // HIST-035: edit the winner and a deck name.
    await page.getByTestId("past-edit").click();
    await page.getByTestId("edit-winner-d1-s2").click();
    await page.getByTestId("edit-deck-2").fill("Kaalia Combo");
    await expectNoSeriousA11yViolations(page);
    await page.getByTestId("edit-save").click();
    await expect(detail.getByTestId("past-game-outcome")).toContainText("Winner Cy");
    await expect(detail.getByTestId("past-game-outcome")).toContainText("Edited");
    await expect(detail.getByTestId("past-standing").first()).toContainText("Kaalia Combo");

    // Delete.
    await page.getByTestId("past-delete").click();
    await page.getByTestId("past-delete-confirm").click();
    await expect(cards).toHaveCount(25);
    await expect(page.getByTestId("harness-records")).toHaveText("25");
  });

  test("players: W/L, default names hidden, detail", async ({ page }) => {
    await page.getByTestId("past-tabs-players").click();
    const rows = page.getByTestId("player-row");
    await expect(rows).toHaveCount(5);
    await expect(rows.nth(0).getByTestId("player-name")).toHaveText("Ben");
    await expect(rows.nth(0).getByTestId("player-wl")).toHaveText("7 W · 16 L");
    await expect(rows.nth(1).getByTestId("player-name")).toHaveText("Ana");
    await expect(rows.nth(1).getByTestId("player-pct")).toHaveText("43%");
    await expect(page.getByTestId("past-players")).not.toContainText("Player 3");
    await expectNoSeriousA11yViolations(page);
    // HIST-033 toggle shows default names.
    await page.getByTestId("players-show-defaults").click();
    await expect(rows).toHaveCount(7);
    await expect(page.getByTestId("past-players")).toContainText("Player 3");
    await page.getByTestId("players-show-defaults").click();

    await rows.nth(1).getByTestId("player-open").click();
    const d = page.getByTestId("past-player-detail");
    await expect(d.getByTestId("player-detail-name")).toHaveText("Ana");
    const pos = d.getByTestId("pd-position").getByTestId("bucket-row");
    await expect(pos.nth(0)).toContainText("Goes first");
    await expect(pos.nth(0)).toContainText("5 W · 3 L");
    await expect(pos.nth(0).getByTestId("bucket-pct")).toHaveText("63%");
    await expect(d.getByTestId("pd-h2h")).toContainText("9–6 in 24");
    await expect(d.getByTestId("pd-cause")).toContainText("Life (8)");
    await expect(d.getByTestId("pd-turn")).toContainText("1 min");
    await expectNoSeriousA11yViolations(page);
  });

  test("decks and deck detail", async ({ page }) => {
    await page.getByTestId("past-tabs-decks").click();
    const rows = page.getByTestId("deck-row");
    await expect(rows).toHaveCount(3);
    await expect(rows.nth(0).getByTestId("deck-name")).toHaveText("Toxrill");
    await expect(rows.nth(1).getByTestId("deck-name")).toHaveText("Kaalia");
    await expectNoSeriousA11yViolations(page);
    await rows.nth(0).getByRole("button").click();
    const d = page.getByTestId("past-deck-detail");
    await expect(d.getByTestId("dd-place")).toContainText("2.2");
    await expect(d.getByTestId("dd-to")).toContainText("Ben");
    await expect(d.getByTestId("dd-from")).toContainText("Cy");
    await expectNoSeriousA11yViolations(page);
  });

  test("insights", async ({ page }) => {
    await page.getByTestId("past-tabs-insights").click();
    await expect(page.getByTestId("ins-games")).toHaveText("26");
    await expect(page.getByTestId("ins-total")).toHaveText("17 h 30 min");
    await expect(page.getByTestId("ins-avg")).toHaveText("40 min");
    await expect(page.getByTestId("ins-position-1")).toContainText("15/23 · 65%");
    await expect(page.getByTestId("ins-position-4")).toContainText("3/14 · 21%");
    await expect(page.getByTestId("ins-causes")).toContainText("Commander damage");
    await expect(page.getByTestId("ins-first-blood")).toContainText("9 of 26 games");
    await expect(page.getByTestId("ins-cmd")).toContainText("42 dealt");
    await expect(page.getByTestId("ins-clock")).toContainText("Slowest (avg turn): Cy");
    await expect(page.getByTestId("ins-playgroups")).toContainText("12 games together");
    await expect(page.getByTestId("ins-suggest")).toHaveAttribute("href", "/feedback");
    await expect(page.getByTestId("insights-locked")).toHaveCount(0);
    await expectNoSeriousA11yViolations(page);
  });

  test("filter sheet and chips apply to every tab", async ({ page }) => {
    await page.getByTestId("past-filter").click();
    const sheet = page.getByTestId("filter-sheet");
    await expect(sheet).toBeVisible();
    await expectNoSeriousA11yViolations(page);
    await sheet.getByTestId("filter-preset-mtg.constructed").click();
    await expect(sheet.getByTestId("filter-apply")).toHaveText("Show 8 games");
    await sheet.getByTestId("filter-apply").click();
    await expect(page.getByTestId("game-card")).toHaveCount(8);
    await expect(page.getByTestId("filter-chip-presetIds")).toBeVisible();
    await page.getByTestId("past-tabs-players").click();
    await expect(page.getByTestId("player-row")).toHaveCount(2);
    // Players included + has winner only.
    await page.getByTestId("past-filter").click();
    await sheet.getByTestId("filter-winner-only").click();
    await sheet.getByTestId("filter-apply").click();
    await page.getByTestId("past-tabs-games").click();
    await expect(page.getByTestId("game-card")).toHaveCount(7);
    await page.getByTestId("filter-chip-presetIds").getByRole("button").click();
    await expect(page.getByTestId("game-card")).toHaveCount(23);
    await page.getByTestId("filter-clear").click();
    await expect(page.getByTestId("game-card")).toHaveCount(26);
  });

  test("export CSV / JSON and import with dedupe", async ({ page }) => {
    await page.getByTestId("past-export").click();
    await expectNoSeriousA11yViolations(page);
    const [csv] = await Promise.all([
      page.waitForEvent("download"),
      page.getByTestId("export-csv").click(),
    ]);
    expect(csv.suggestedFilename()).toMatch(/^tcgtempo-games-\d{4}-\d\d-\d\d\.csv$/);
    const lines = (await downloadText(csv)).trimEnd().split("\r\n");
    // One row per game-seat: 12×4 + 8×2 + 4×4 + 2×3 = 86, plus the header.
    expect(lines).toHaveLength(87);
    expect(lines[0]).toContain("game_id,started_at,ended_at");

    const [json] = await Promise.all([
      page.waitForEvent("download"),
      page.getByTestId("export-json").click(),
    ]);
    const data = JSON.parse(await downloadText(json)) as { records: { id: string }[] };
    expect(data.records).toHaveLength(26);
    // Import the same file plus one new record: duplicates are skipped.
    const extra = { ...data.records[0]!, id: "imported-1" };
    const payload = JSON.stringify({ ...data, records: [...data.records, extra] });
    await page.getByTestId("import-file").setInputFiles({
      name: "games.json",
      mimeType: "application/json",
      buffer: Buffer.from(payload),
    });
    await expect(page.getByTestId("snackbar")).toContainText("Imported 1 games (26 already here)");
    await expect(page.getByTestId("harness-records")).toHaveText("27");
  });
});

test("the /history page shows Past Games", async ({ page }) => {
  await seedFixtures(page);
  await page.goto("/history");
  await page.getByTestId("history-segment-past").click();
  await expect(page.getByTestId("game-card")).toHaveCount(26);
  await expectNoSeriousA11yViolations(page);
});
