// @req PRE-003 @req PRE-012 @req A11Y-002
/** T3.5 preset picker: grouped list, search, recent, favorites persisting across reloads. */
import { expect, test, type Page } from "@playwright/test";
import { expectNoSeriousA11yViolations } from "./support/axe";

async function open(page: Page) {
  await page.goto("/dev/presets");
  await expect(page.getByTestId("preset-picker")).toHaveAttribute("data-loaded", "true");
}

test("groups by game with rules quick-ref, verify hints and rules links", async ({ page }) => {
  await open(page);
  const mtg = page.getByTestId("preset-section-game-magic-the-gathering");
  await expect(mtg.getByTestId(/^preset-row-/)).toHaveCount(5);
  await expect(page.getByTestId("preset-section-game-generic")).toBeVisible();
  await expect(page.getByTestId("preset-summary-fftcg.standard")).toContainText("7th point");
  await expect(page.getByTestId("preset-verify-fftcg.standard")).toBeVisible();
  await expect(page.getByTestId("preset-verify-generic.life")).toHaveCount(0);
  const link = page.getByTestId("preset-rules-pokemon.standard");
  await expect(link).toHaveAttribute("href", /^https:\/\//);
  await expect(link).toHaveAttribute("target", "_blank");
  await expect(page.getByTestId("preset-rules-generic.life")).toHaveCount(0);
  await expect(page.getByTestId("preset-row-pokemon.pocket")).toHaveCount(0);
  await expectNoSeriousA11yViolations(page);
});

test("search filters by name, game and format (accent-insensitive)", async ({ page }) => {
  await open(page);
  const search = page.getByTestId("preset-search");
  await search.fill("pokemon");
  await expect(page.getByTestId(/^preset-row-/)).toHaveCount(1);
  await expect(page.getByTestId("preset-row-pokemon.standard")).toBeVisible();
  await search.fill("duel");
  await expect(page.getByTestId(/^preset-row-/)).toHaveCount(2);
  await search.fill("no such game");
  await expect(page.getByTestId("preset-no-results")).toBeVisible();
  await search.fill("");
  await expect(page.getByTestId("preset-row-generic.life")).toBeVisible();
});

test("selecting adds to Recent; favorites persist after reload", async ({ page }) => {
  await open(page);
  await page.getByTestId("preset-select-lorcana.standard").click();
  await expect(page.getByTestId("harness-picked")).toHaveText("lorcana.standard");
  await expect(page.getByTestId("preset-row-lorcana.standard").first()).toHaveAttribute(
    "data-selected",
    "true",
  );
  const recent = page.getByTestId("preset-section-recent");
  await expect(recent.getByTestId("preset-row-lorcana.standard")).toBeVisible();

  const fav = page
    .getByTestId("preset-section-game-yu-gi-oh-trading-card-game")
    .getByTestId("preset-fav-ygo.advanced");
  await fav.click();
  await expect(fav).toHaveAttribute("aria-pressed", "true");
  const favorites = page.getByTestId("preset-section-favorites");
  await expect(favorites.getByTestId("preset-row-ygo.advanced")).toBeVisible();
  await expect(page.getByTestId("preset-picker")).toHaveAttribute("data-saved", "true");

  await page.reload();
  await expect(page.getByTestId("preset-picker")).toHaveAttribute("data-loaded", "true");
  await expect(favorites.getByTestId("preset-row-ygo.advanced")).toBeVisible();
  await expect(recent.getByTestId("preset-row-lorcana.standard")).toBeVisible();

  // Un-favorite from the Favorites section.
  await favorites.getByTestId("preset-fav-ygo.advanced").click();
  await expect(favorites).toHaveCount(0);
});
