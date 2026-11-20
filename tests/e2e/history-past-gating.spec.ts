// @req HIST-007 @req HIST-021 @req HIST-022 @req HIST-023 @req HIST-024 @req HIST-006 @req PAY-001
// @req A11Y-002
/** §17.2 free-tier states with the entitlement policy set to TIERED (free user). */
import { expect, test } from "@playwright/test";
import { expectNoSeriousA11yViolations } from "./support/axe";
import { seedFixtures } from "./support/records";

test.use({ timezoneId: "UTC" });

test.beforeEach(async ({ page }) => {
  await seedFixtures(page, "&policy=tiered");
  await expect(page.getByTestId("harness-policy")).toContainText("TIERED");
});

test("games: the most recent 5 are viewable, then the unlock row (HIST-007)", async ({ page }) => {
  await expect(page.getByTestId("game-card")).toHaveCount(5);
  await expect(page.getByTestId("games-more-locked")).toHaveText(
    "21 more games saved — unlock with Pro",
  );
  await expectNoSeriousA11yViolations(page);
  // Upgrading reveals everything immediately.
  await page.getByTestId("harness-policy").click();
  await expect(page.getByTestId("game-card")).toHaveCount(26);
  await expect(page.getByTestId("games-more-locked")).toHaveCount(0);
});

test("players W/L is free; player detail is a blurred preview", async ({ page }) => {
  await page.getByTestId("past-tabs-players").click();
  // Stats use the 5 viewable games (c2..d2): Ana plays c2–c4 = 3.
  const ana = page.locator('[data-identity="p:p-ana"]');
  await expect(ana).toContainText("3 games");
  await ana.getByTestId("player-open").click();
  const locked = page.getByTestId("player-detail-locked");
  await expect(locked).toHaveAttribute("data-locked", "true");
  await expect(page.getByTestId("player-detail-locked-unlock")).toHaveAttribute("href", "/account");
  await expectNoSeriousA11yViolations(page);
});

test("decks: built from the viewable games; Pro reveals the rest", async ({ page }) => {
  await page.getByTestId("past-tabs-decks").click();
  // The 5 viewable games (c2..d2) carry no decks, so a free user sees the empty state.
  await expect(page.getByTestId("past-decks")).toContainText("No decks yet");
  await expectNoSeriousA11yViolations(page);
  // Upgrading reveals every game's decks (Toxrill, Krenko, Kaalia from group A).
  await page.getByTestId("harness-policy").click();
  await expect(page.getByTestId("deck-row")).toHaveCount(3);
});

test("insights: summary tiles free, the dashboard locked", async ({ page }) => {
  await page.getByTestId("past-tabs-insights").click();
  await expect(page.getByTestId("ins-games")).toHaveText("5");
  await expect(page.getByTestId("insights-locked")).toHaveAttribute("data-locked", "true");
  await expect(page.getByTestId("insights-locked-unlock")).toBeVisible();
  await expectNoSeriousA11yViolations(page);
});

test("filters: date range only; export locked", async ({ page }) => {
  await page.getByTestId("past-filter").click();
  const sheet = page.getByTestId("filter-sheet");
  await expect(sheet.getByTestId("filter-pro-only")).toBeVisible();
  await expect(sheet.getByTestId("filter-preset-mtg.constructed")).toBeDisabled();
  await expect(sheet.getByTestId("filter-winner-only")).toBeDisabled();
  // Date range (fixtures end at 20:00 UTC on Sep 2..27, 2026): Sep 14–21 = the B games.
  await sheet.getByTestId("filter-from").fill("2026-09-14");
  await sheet.getByTestId("filter-to").fill("2026-09-21");
  await expectNoSeriousA11yViolations(page);
  await sheet.getByTestId("filter-apply").click();
  // the 8 B games match; a free user sees the 5 most recent of them
  await expect(page.getByTestId("game-card")).toHaveCount(5);
  await expect(page.getByTestId("filter-chip-date")).toBeVisible();

  await page.getByTestId("past-export").click();
  await expect(page.getByTestId("export-locked")).toHaveAttribute("data-locked", "true");
  await expectNoSeriousA11yViolations(page);
});
