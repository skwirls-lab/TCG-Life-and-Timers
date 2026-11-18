// Paywall gating (T7.1, T7.4). `pw=1` (test builds) = TIERED policy for a free user; the tab keeps
// it across navigations. Without it the build default applies (paywall disabled → all free).
// @req PAY-001 @req PAY-002 @req PAY-004 @req ART-007 @req A11Y-002
import { expect, test, type Page } from "@playwright/test";
import { menuTap } from "./support/menu";
import { expectNoSeriousA11yViolations } from "./support/axe";
import { gotoHarness, openSeatMenu } from "./support/seatHarness";

async function expectPaywall(page: Page, feature: string) {
  const sheet = page.getByTestId("paywall");
  await expect(sheet).toBeVisible();
  await expect(sheet.locator("[data-feature]")).toHaveAttribute("data-feature", feature);
  await expect(page.getByTestId("paywall-locked")).toBeVisible();
  await expect(sheet.locator('[data-highlight="1"]')).toHaveCount(1);
}

async function closePaywall(page: Page) {
  await page.getByTestId("paywall-close").click();
  await expect(page.getByTestId("paywall")).toHaveCount(0);
}

async function tiered(page: Page, path: string) {
  await page.goto(`${path}${path.includes("?") ? "&" : "?"}pw=1`);
  await page.waitForFunction(() => window.__tcgPay?.state().policy === "TIERED");
}

async function addProfile(page: Page, name: string) {
  await page.getByTestId("profile-new").click();
  await page.getByTestId("profile-name-input").fill(name);
  await page.getByTestId("profile-save").click();
  await expect(page.getByTestId("deck-new")).toBeVisible();
  await page.getByTestId("page-back").click();
  await expect(page.getByTestId("profile-row-0")).toBeVisible();
}

test.describe("paywall enabled (pw=1, free user)", () => {
  // @req PAY-004
  test("7–8 player chips open the paywall in setup, settings and the board", async ({ page }) => {
    await tiered(page, "/setup");
    await page.getByTestId("setup-next").click();
    await page.getByTestId("setup-players-7").click();
    await expectPaywall(page, "players7to8");
    await expectNoSeriousA11yViolations(page);
    await closePaywall(page);
    await expect(page.getByTestId("setup-players-7")).toHaveAttribute("aria-checked", "false");
    // 2–6 stay free
    await page.getByTestId("setup-players-6").click();
    await expect(page.getByTestId("setup-players-6")).toHaveAttribute("aria-checked", "true");
    await expect(page.getByTestId("paywall")).toHaveCount(0);

    await page.goto("/settings");
    await page.getByTestId("setting-players-control-8").click();
    await expectPaywall(page, "players7to8");
    await closePaywall(page);

    await page.goto("/play?quick=mtg.commander&players=4&seed=7");
    await menuTap(page, "toolbar-players");
    await page.getByTestId("players-count-8").click();
    await expectPaywall(page, "players7to8");
  });

  // @req PAY-004
  test("every clock mode is free (no paywall)", async ({ page }) => {
    await tiered(page, "/play?quick=mtg.commander&players=4&seed=7");
    await menuTap(page, "toolbar-settings");
    await expect(page.getByTestId("settings")).toBeVisible();
    const mode = page.getByTestId("setting-timer.mode-control");
    await expect(mode).toBeEnabled();
    for (const m of ["bankIncrement", "bankDelay", "perTurn", "perTurnReserve", "bank"]) {
      await mode.selectOption(m);
      await expect(mode).toHaveValue(m);
      await expect(page.getByTestId("paywall")).toHaveCount(0);
    }
  });

  // @req PAY-004
  test("a second custom preset opens the paywall", async ({ page }) => {
    await tiered(page, "/builder");
    await expect(page.getByTestId("builder-empty")).toBeVisible();
    await page.getByTestId("builder-duplicate-open").click();
    await page.getByTestId("builder-dup-mtg.commander").click();
    await expect(page).toHaveURL(/\/builder\/edit\?id=custom\./);
    await page.goto("/builder");
    await expect(page.getByTestId("builder-preset-0")).toBeVisible();
    await expect(page.getByTestId("builder-limit")).toBeVisible();
    await page.getByTestId("builder-new").click();
    await expectPaywall(page, "customPresetsUnlimited");
    await closePaywall(page);
    await page.getByTestId("builder-limit-cta").click();
    await expectPaywall(page, "customPresetsUnlimited");
    await closePaywall(page);
    await page.getByTestId("builder-copy-0").click();
    await expectPaywall(page, "customPresetsUnlimited");
    await closePaywall(page);
    // editing / exporting the existing preset is never blocked
    await page.getByTestId("builder-edit-0").click();
    await expect(page.getByTestId("editor-form")).toBeVisible();
    await expect(page.getByTestId("builder-limit")).toHaveCount(0);
  });

  // @req PAY-004
  test("a 5th profile and a 4th deck open the paywall", async ({ page }) => {
    await tiered(page, "/profiles");
    for (const n of ["Ann", "Ben", "Cat", "Dan"]) await addProfile(page, n);
    await page.getByTestId("profile-new").click();
    await expectPaywall(page, "profilesUnlimited");
    await closePaywall(page);
    await expect(page.getByTestId("profile-editor")).toHaveCount(0);

    await page.getByTestId("profile-row-0").click();
    for (const d of ["D1", "D2", "D3"]) {
      await page.getByTestId("deck-new").click();
      await page.getByTestId("deck-name-input").fill(d);
      await page.getByTestId("deck-save").click();
      await expect(page.getByTestId("deck-new")).toBeVisible();
    }
    await page.getByTestId("deck-new").click();
    await expectPaywall(page, "profilesUnlimited");
  });

  // @req PAY-004
  test("Pro themes open the paywall", async ({ page }) => {
    await tiered(page, "/settings");
    const theme = page.getByTestId("setting-theme-control");
    await theme.selectOption("pro");
    await expectPaywall(page, "themesPro");
    await closePaywall(page);
    await expect(theme).toHaveValue("dark");
    await theme.selectOption("light");
    await expect(theme).toHaveValue("light");
  });

  // @req ART-007
  test("Scryfall art and backgrounds are never gated", async ({ page }) => {
    await gotoHarness(page, "&pw=1");
    await page.waitForFunction(() => window.__tcgPay?.state().policy === "TIERED");
    await openSeatMenu(page, 0);
    const menu = page.getByTestId("seat-menu");
    await expect(page.getByTestId("art-picker")).toBeVisible();
    await expect(menu.getByLabel("Pro feature")).toHaveCount(0);
    await page.getByTestId("bg-gradient-ocean").click();
    await expect(page.getByTestId("paywall")).toHaveCount(0);
    // and the comparison table lists art as free
    await page.goto("/pro");
    await expect(page.getByTestId("paywall-row-art")).toContainText("Included");
  });

  // @req PAY-004 @req A11Y-002
  test("the paywall sheet compares Free vs Pro and is accessible", async ({ page }) => {
    await tiered(page, "/settings");
    await page.getByTestId("setting-theme-control").selectOption("pro");
    await expectPaywall(page, "themesPro");
    await expect(page.getByTestId("paywall-row-themes")).toHaveAttribute("data-highlight", "1");
    await expect(page.getByTestId("paywall-table").locator("tbody tr")).not.toHaveCount(0);
    // no cloud / Stripe config in this build: buttons disabled with the reason
    await expect(page.getByTestId("paywall-not-configured")).toBeVisible();
    await expect(page.getByTestId("paywall-buy-monthly")).toBeDisabled();
    await expect(page.getByTestId("paywall-plan-yearly")).toContainText("$14.99");
    await expect(page.getByTestId("paywall-plan-lifetime")).toContainText("$29.99");
    await expectNoSeriousA11yViolations(page);
    await page.getByTestId("paywall-see-all").click();
    await expect(page).toHaveURL(/\/pro$/);
    await expect(page.getByTestId("pro-status")).toHaveAttribute("data-policy", "TIERED");
  });
});

test.describe("paywall disabled (default build)", () => {
  // @req PAY-001
  test("nothing is gated", async ({ page }) => {
    await page.goto("/setup");
    await page.getByTestId("setup-next").click();
    await page.getByTestId("setup-players-8").click();
    await expect(page.getByTestId("setup-players-8")).toHaveAttribute("aria-checked", "true");
    await expect(page.getByLabel("Pro feature")).toHaveCount(0);

    await page.goto("/builder");
    await page.getByTestId("builder-duplicate-open").click();
    await page.getByTestId("builder-dup-mtg.commander").click();
    await expect(page).toHaveURL(/\/builder\/edit\?id=custom\./);
    await page.goto("/builder");
    await page.getByTestId("builder-new").click();
    await expect(page).toHaveURL(/\/builder\/edit$/);
    await expect(page.getByTestId("builder-limit")).toHaveCount(0);

    await page.goto("/play?quick=mtg.commander&players=4&seed=7");
    await menuTap(page, "toolbar-settings");
    await expect(page.getByTestId("settings")).toBeVisible();
    await page.getByTestId("setting-timer.mode-control").selectOption("bankIncrement");
    await expect(page.getByTestId("setting-timer.mode-control")).toHaveValue("bankIncrement");
    await expect(page.getByTestId("paywall")).toHaveCount(0);
  });

  // @req PAY-002 @req PAY-004 @req A11Y-002
  test("/pro explains that Pro is not configured", async ({ page }) => {
    await page.goto("/pro?status=cancel");
    await expect(page.getByTestId("pro-page")).toBeVisible();
    await expect(page.getByTestId("pro-status")).toHaveAttribute("data-policy", "ALL_FREE");
    await expect(page.getByTestId("pro-not-configured")).toHaveAttribute(
      "data-reason",
      "cloudMissing",
    );
    for (const plan of ["monthly", "yearly", "lifetime"])
      await expect(page.getByTestId(`pro-buy-${plan}`)).toBeDisabled();
    await expect(page.getByTestId("pro-restore")).toBeDisabled();
    await expect(page.getByTestId("pro-return-cancel")).toBeVisible();
    await expectNoSeriousA11yViolations(page);

    await page.goto("/settings");
    await page.getByTestId("setting-support-control").click();
    await expect(page).toHaveURL(/\/pro$/);
  });
});
