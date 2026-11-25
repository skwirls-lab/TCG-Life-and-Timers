// Pro entry points and the "You're Pro" state (owner feedback: Upgrade was hard to find, and /pro
// still offered plans after subscribing), plus Back after returning from another site (Stripe).
// Test builds have no cloud: Pro is set through the test hooks (`pw=` and window.__tcgPay /
// window.__tcgProDetails), the same stores entitlement sync writes.
// @req PAY-002 @req PAY-004 @req A11Y-002
import { expect, test, type Page } from "@playwright/test";
import { expectNoSeriousA11yViolations } from "./support/axe";
import { openMenu } from "./support/menu";

const YEAR_MS = 365 * 24 * 60 * 60 * 1000;

/** Make this page's session Pro (keeps the build's policy) with optional plan details. */
async function becomePro(page: Page, details?: Record<string, unknown>) {
  await page.waitForFunction(() => window.__tcgPay !== undefined);
  await page.evaluate((d) => {
    window.__tcgPay!.state().setPro(true);
    if (d) window.__tcgProDetails?.getState().setDetails(d as never);
  }, details ?? null);
}

test.describe("Pro entry points (paywall off: framed as support)", () => {
  test("launcher card: Support TCGTempo → /pro; dismissed for two weeks", async ({ page }) => {
    await page.goto("/");
    const card = page.getByTestId("launcher-pro-card");
    await expect(card).toBeVisible();
    await expect(card).toHaveAttribute("data-policy", "ALL_FREE");
    await expect(card).toContainText("Support TCGTempo");
    await expect(card).toContainText("Everything is free right now");
    await expect(card).not.toContainText(/locked|unlock/i);
    await expect(page.getByTestId("launcher-pro-badge")).toHaveCount(0);
    await expectNoSeriousA11yViolations(page);

    await page.getByTestId("launcher-pro-link").click();
    await expect(page).toHaveURL(/\/pro$/);
    await page.getByTestId("page-back").click();
    await expect(page).toHaveURL(/\/$/);

    await page.getByTestId("launcher-pro-dismiss").click();
    await expect(card).toHaveCount(0);
    await page.reload();
    await expect(page.getByTestId("launcher-brand")).toBeVisible();
    await page.waitForTimeout(300);
    await expect(page.getByTestId("launcher-pro-card")).toHaveCount(0);
    // ...for 14 days only
    await page.evaluate((y) => {
      localStorage.setItem("tcg.pro.cardDismissedAt", String(Date.now() - y / 26 - 1000));
    }, YEAR_MS);
    await page.reload();
    await expect(page.getByTestId("launcher-pro-card")).toBeVisible();
  });

  test("paywall on: the launcher card says Go Pro; Pro users get a badge instead", async ({
    page,
  }) => {
    await page.goto("/?pw=1");
    await expect(page.getByTestId("launcher-pro-card")).toHaveAttribute("data-policy", "TIERED");
    await expect(page.getByTestId("launcher-pro-card")).toContainText("Go Pro");
    await page.goto("/?pw=pro");
    await expect(page.getByTestId("launcher-pro-badge")).toBeVisible();
    await expect(page.getByTestId("launcher-pro-card")).toHaveCount(0);
    await page.getByTestId("launcher-pro-badge").click();
    await expect(page.getByTestId("pro-pro-state")).toBeVisible();
  });

  test("Settings: the Pro card is first; Go Pro for free users, Pro · Manage for Pro", async ({
    page,
  }) => {
    await page.goto("/settings");
    const card = page.getByTestId("settings-pro-card");
    await expect(card).toBeVisible();
    await expect(card).toHaveAttribute("data-pro", "0");
    await expect(card).toContainText("TCGTempo Pro");
    await expect(card).toContainText("Go Pro");
    // first thing on the page, above the settings sections; the bottom row stays
    const cardBox = (await card.boundingBox())!;
    const firstSection = (await page
      .locator('[data-testid^="settings-section-"]')
      .first()
      .boundingBox())!;
    expect(cardBox.y).toBeLessThan(firstSection.y);
    await expect(page.getByTestId("setting-support")).toHaveCount(1);
    await expectNoSeriousA11yViolations(page);

    await becomePro(page, {
      plan: "monthly",
      currentPeriodEnd: Date.UTC(2027, 0, 15, 12),
      cancelAtPeriodEnd: false,
      source: "subscription",
    });
    await expect(card).toHaveAttribute("data-pro", "1");
    await expect(page.getByTestId("settings-pro-status")).toHaveText("Pro · Monthly");
    await expect(page.getByTestId("settings-pro-renewal")).toHaveText("Renews on Jan 15, 2027");
    await expect(page.getByTestId("settings-pro-manage")).toBeVisible();
    await page.getByTestId("settings-pro-link").click();
    await expect(page.getByTestId("pro-pro-state")).toBeVisible();
  });

  test("Account shows the plan and Manage subscription, or Support / Upgrade", async ({ page }) => {
    await page.goto("/account");
    await expect(page.getByTestId("account-pro")).toHaveAttribute("data-pro", "0");
    await expect(page.getByTestId("account-pro-upgrade")).toContainText("Support TCGTempo");
    await expect(page.getByTestId("account-pro-upgrade")).toHaveAttribute("href", "/pro");
    await becomePro(page, {
      plan: "yearly",
      currentPeriodEnd: Date.UTC(2027, 5, 1, 12),
      cancelAtPeriodEnd: true,
      source: "subscription",
    });
    await expect(page.getByTestId("account-pro-plan")).toHaveText("Pro · Yearly");
    await expect(page.getByTestId("account-pro-renewal")).toHaveText("Cancels on Jun 1, 2027");
    await expect(page.getByTestId("account-pro-manage")).toBeVisible();
    await expectNoSeriousA11yViolations(page);
  });

  test("the game menu has a Pro tile for free users only", async ({ page }) => {
    await page.goto("/play?quick=mtg.commander&players=4&seed=3");
    await openMenu(page);
    await expect(page.getByTestId("center-menu-pro")).toBeVisible();
    await page.getByTestId("center-menu-pro").click();
    await expect(page).toHaveURL(/\/pro$/);
    await page.getByTestId("page-back").click();
    await expect(page).toHaveURL(/\/play/);
    await becomePro(page);
    await openMenu(page);
    await expect(page.getByTestId("toolbar-settings")).toBeVisible();
    await expect(page.getByTestId("center-menu-pro")).toHaveCount(0);
  });
});

test.describe("/pro for a Pro account", () => {
  test("You're Pro: plan, renewal, Manage subscription, Restore; no purchase buttons", async ({
    page,
  }) => {
    await page.goto("/pro?pw=pro");
    const state = page.getByTestId("pro-pro-state");
    await expect(state).toBeVisible();
    await expect(state).toContainText("You're Pro");
    // an older entitlement doc (no plan fields): "Pro" without dates
    await expect(page.getByTestId("pro-pro-plan")).toHaveText("Pro");
    await expect(page.getByTestId("pro-pro-renewal")).toHaveCount(0);
    await expect(page.locator('[data-testid^="pro-buy-"]')).toHaveCount(0);
    await expect(page.locator('[data-testid^="pro-plan-"]')).toHaveCount(0);
    await expect(page.getByTestId("pro-manage")).toBeVisible();
    await expect(page.getByTestId("pro-pro-included")).toContainText("Unlimited presets");

    await becomePro(page, {
      plan: "yearly",
      currentPeriodEnd: Date.UTC(2027, 10, 25, 12),
      cancelAtPeriodEnd: false,
      source: "subscription",
    });
    await expect(page.getByTestId("pro-pro-plan")).toHaveText("Yearly");
    await expect(page.getByTestId("pro-pro-renewal")).toHaveText("Renews on Nov 25, 2027");
    await becomePro(page, {
      plan: "monthly",
      currentPeriodEnd: Date.UTC(2026, 11, 25, 12),
      cancelAtPeriodEnd: true,
      source: "subscription",
    });
    await expect(page.getByTestId("pro-pro-renewal")).toHaveText("Cancels on Dec 25, 2026");
    await expect(page.getByTestId("pro-pro-renewal")).toHaveAttribute("data-cancels", "1");
    await becomePro(page, {
      plan: "manual",
      currentPeriodEnd: null,
      cancelAtPeriodEnd: false,
      source: "manual",
    });
    await expect(page.getByTestId("pro-pro-plan")).toHaveText("Gift");
    await expect(page.getByTestId("pro-manage")).toHaveCount(0); // nothing to manage
    await expectNoSeriousA11yViolations(page);
  });

  test("the paywall sheet turns into You're Pro once the account is Pro", async ({ page }) => {
    await page.goto("/settings?pw=1");
    await page.waitForFunction(() => window.__tcgPay?.state().policy === "TIERED");
    await page.getByTestId("setting-theme-control").selectOption("pro");
    await expect(page.getByTestId("paywall")).toBeVisible();
    await expect(page.getByTestId("paywall-buy-monthly")).toBeVisible();
    // e.g. bought in another tab: the entitlement listener flips Pro
    await becomePro(page, {
      plan: "monthly",
      currentPeriodEnd: Date.UTC(2026, 11, 25, 12),
      cancelAtPeriodEnd: false,
      source: "subscription",
    });
    await expect(page.getByTestId("paywall-pro-state")).toBeVisible();
    await expect(page.getByTestId("paywall-pro-plan")).toHaveText("Monthly");
    await expect(page.locator('[data-testid^="paywall-buy-"]')).toHaveCount(0);
    await expect(page.getByTestId("paywall-manage")).toBeVisible();
  });
});

test.describe("Back after leaving the app (Stripe Checkout and back)", () => {
  test("Back never returns to the external page", async ({ page }) => {
    await page.goto("/");
    await page.getByTestId("launcher-link-settings").click();
    await expect(page).toHaveURL(/\/settings$/);
    await page.getByTestId("settings-pro-link").click();
    await expect(page).toHaveURL(/\/pro$/);
    // "Checkout": another site, then a full page load of the success URL
    await page.goto("about:blank");
    await page.goto("/pro?checkout=success&session_id=cs_test_1");
    await expect(page.getByTestId("pro-return-success")).toBeVisible();
    // the handled query is dropped, the banner stays
    await expect(page).toHaveURL(/\/pro$/);
    await expect(page.getByTestId("pro-return-success")).toBeVisible();
    await page.getByTestId("page-back").click();
    await expect(page).toHaveURL(/\/settings$/);
    await page.getByTestId("page-back").click();
    await expect(page).toHaveURL(/\/$/);
    await expect(page.getByTestId("launcher-brand")).toBeVisible();
  });

  test("a canceled checkout: Back goes up to Settings even with no trail", async ({ page }) => {
    await page.goto("about:blank");
    await page.goto("/pro?checkout=cancel");
    await expect(page.getByTestId("pro-return-cancel")).toBeVisible();
    await expect(page).toHaveURL(/\/pro$/);
    await page.getByTestId("page-back").click();
    await expect(page).toHaveURL(/\/settings$/);
  });
});
