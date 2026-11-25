// Review screenshots for the Pro entry points at 360×740 (not part of any gate):
//   E2E_PORT=3313 npx playwright test -c playwright.screens.config.ts tests/screens/pro-ux.spec.ts
// Saved under artifacts/pro-ux/ (gitignored).
import { test, type Page } from "@playwright/test";

const OUT = "artifacts/pro-ux";
test.use({ viewport: { width: 360, height: 740 }, deviceScaleFactor: 2 });

const DETAILS = {
  plan: "yearly",
  currentPeriodEnd: Date.UTC(2027, 10, 25, 12),
  cancelAtPeriodEnd: false,
  source: "subscription",
};

async function becomePro(page: Page, details: Record<string, unknown> = DETAILS) {
  await page.waitForFunction(() => window.__tcgPay !== undefined);
  await page.evaluate((d) => {
    window.__tcgPay!.state().setPro(true);
    window.__tcgProDetails?.getState().setDetails(d as never);
  }, details);
}

async function shot(page: Page, name: string, fullPage = false) {
  await page.waitForTimeout(400);
  await page.screenshot({ path: `${OUT}/${name}.png`, fullPage });
}

test("launcher free (support) / paywall on / Pro", async ({ page }) => {
  await page.goto("/");
  await page.getByTestId("launcher-pro-card").waitFor();
  await shot(page, "launcher-free");
  await shot(page, "launcher-free-full", true);
  await page.goto("/?pw=1");
  await page.getByTestId("launcher-pro-card").waitFor();
  await shot(page, "launcher-free-tiered", true);
  await page.goto("/?pw=0");
  await becomePro(page);
  await page.getByTestId("launcher-pro-badge").waitFor();
  await shot(page, "launcher-pro");
});

test("settings top card", async ({ page }) => {
  await page.goto("/settings");
  await page.getByTestId("settings-pro-card").waitFor();
  await shot(page, "settings-free");
  await becomePro(page, { ...DETAILS, plan: "monthly", currentPeriodEnd: Date.UTC(2026, 11, 25) });
  await shot(page, "settings-pro");
});

test("/pro states", async ({ page }) => {
  await page.goto("/pro");
  await shot(page, "pro-free-allfree");
  await becomePro(page);
  await page.getByTestId("pro-pro-state").waitFor();
  await shot(page, "pro-pro", true);
  await becomePro(page, { ...DETAILS, plan: "monthly", cancelAtPeriodEnd: true });
  await shot(page, "pro-pro-cancels");
  await becomePro(page, {
    plan: null,
    currentPeriodEnd: null,
    cancelAtPeriodEnd: false,
    source: "subscription",
  });
  await shot(page, "pro-pro-olddoc");
});

test("account", async ({ page }) => {
  await page.goto("/account");
  await page.getByTestId("account-pro").waitFor();
  await shot(page, "account-free", true);
  await becomePro(page);
  await shot(page, "account-pro", true);
});

test("game menu tile", async ({ page }) => {
  await page.goto("/play?quick=mtg.commander&players=4&seed=3");
  await page.getByTestId("center-menu").click();
  await page.getByTestId("center-menu-pro").waitFor();
  await shot(page, "menu-free");
});
