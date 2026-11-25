// Stripe checkout + entitlements against the emulators (T7.1, T7.2, D-082). The app's own
// payment functions run in the Functions emulator; without a real Stripe key they use the
// emulator-only Stripe stand-in (functions/src/logic/emulatorStripe.ts): Checkout "pays" at once
// and lands on /pro?checkout=success, where refreshEntitlements grants Pro through the real code.
// @req PAY-002 @req PAY-003 @req PAY-004 @req A11Y-002
import { expect, test, type Page } from "@playwright/test";
import { expectNoSeriousA11yViolations } from "./support/axe";

const FIRESTORE = "http://127.0.0.1:8080/v1/projects/demo-tcg-life/databases/(default)/documents";
const OWNER = { Authorization: "Bearer owner", "Content-Type": "application/json" };

type FsValue = {
  stringValue?: string;
  booleanValue?: boolean;
  timestampValue?: string;
  integerValue?: string;
  nullValue?: null;
  arrayValue?: { values?: FsValue[] };
  mapValue?: { fields: Record<string, FsValue> };
};

async function patchDoc(path: string, fields: Record<string, FsValue>) {
  const mask = Object.keys(fields)
    .map((f) => `updateMask.fieldPaths=${f}`)
    .join("&");
  const res = await fetch(`${FIRESTORE}/${path}?${mask}`, {
    method: "PATCH",
    headers: OWNER,
    body: JSON.stringify({ fields }),
  });
  expect(res.ok, await res.text()).toBe(true);
}

async function getDoc(path: string): Promise<Record<string, FsValue> | null> {
  const res = await fetch(`${FIRESTORE}/${path}`, { headers: OWNER });
  if (res.status === 404) return null;
  return ((await res.json()) as { fields?: Record<string, FsValue> }).fields ?? {};
}

async function signIn(page: Page, label: string, project: string): Promise<string> {
  await page.waitForFunction(() => window.__tcgAuth !== undefined);
  const email = `${label}-${project}-${Date.now()}@example.com`;
  await page.evaluate((e) => window.__tcgAuth!.signInForTests(e), email);
  await page.waitForFunction(() => !!window.__tcgAuth!.auth().user);
  return page.evaluate(() => window.__tcgAuth!.auth().user!.uid);
}

const isPro = (page: Page) => page.evaluate(() => window.__tcgPay?.state().pro ?? null);

/** What the payment functions write for an active subscription (owner access). */
async function grantPro(uid: string) {
  await patchDoc(`users/${uid}/private/entitlements`, {
    pro: { booleanValue: true },
    source: { stringValue: "subscription" },
    updatedAt: { timestampValue: new Date().toISOString() },
  });
}

/** An active subscription "in Stripe" (the emulator stand-in) that the app doesn't know about. */
async function seedStripeSubscription(uid: string): Promise<string> {
  const customerId = `cus_emu${uid.replace(/[^A-Za-z0-9]/g, "")}`;
  const str = (v: string) => ({ stringValue: v });
  await patchDoc(`users/${uid}/private/stripe`, { customerId: str(customerId) });
  await patchDoc(`_emulatorStripe/${customerId}`, {
    uid: str(uid),
    email: { nullValue: null },
    payments: { arrayValue: { values: [] } },
    subscriptions: {
      arrayValue: {
        values: [
          {
            mapValue: {
              fields: {
                id: str("sub_emuSeeded"),
                status: str("active"),
                customer: str(customerId),
                priceIds: { arrayValue: { values: [str("price_e2eMonthly")] } },
                metadata: { mapValue: { fields: { firebaseUID: str(uid) } } },
              },
            },
          },
        ],
      },
    },
  });
  return customerId;
}

test.describe("pay @emu", () => {
  // @req PAY-003 @req PAY-004
  test("an entitlement doc unlocks Pro, which survives an offline reload @emu", async ({
    page,
    context,
  }, info) => {
    await page.goto("/setup?pw=1");
    const uid = await signIn(page, "pro", info.project.name);
    await page.getByTestId("setup-next").click();
    await page.getByTestId("setup-players-7").click();
    await expect(page.getByTestId("paywall")).toBeVisible();
    await page.getByTestId("paywall-close").click();
    await expect(page.getByTestId("paywall")).toHaveCount(0);

    await grantPro(uid);
    await expect.poll(() => isPro(page), { timeout: 15_000 }).toBe(true);
    await page.getByTestId("setup-players-7").click();
    await expect(page.getByTestId("setup-players-7")).toHaveAttribute("aria-checked", "true");
    await expect(page.getByTestId("paywall")).toHaveCount(0);

    // Offline: the cached, recently verified entitlement keeps Pro (14-day grace, PAY-003).
    await page.waitForFunction(
      async () => !!(await navigator.serviceWorker.getRegistration())?.active,
      undefined,
      { timeout: 20_000 },
    );
    await page.reload();
    await page.waitForFunction(() => !!navigator.serviceWorker.controller, undefined, {
      timeout: 20_000,
    });
    await expect.poll(() => isPro(page), { timeout: 15_000 }).toBe(true);
    await context.setOffline(true);
    try {
      await page.reload();
      await expect(page.getByTestId("setup")).toBeVisible();
      await expect.poll(() => isPro(page), { timeout: 15_000 }).toBe(true);
      await page.getByTestId("setup-next").click();
      await page.getByTestId("setup-players-8").click();
      await expect(page.getByTestId("setup-players-8")).toHaveAttribute("aria-checked", "true");
      await expect(page.getByTestId("paywall")).toHaveCount(0);
    } finally {
      await context.setOffline(false);
    }
  });

  // @req PAY-002 @req PAY-003 @req A11Y-002
  test("buy monthly → Checkout → success page → You're Pro (plan, Manage) @emu", async ({
    page,
  }, info) => {
    await page.goto("/pro?pw=1");
    const uid = await signIn(page, "checkout", info.project.name);
    await expect(page.getByTestId("pro-status")).toHaveAttribute("data-policy", "TIERED");
    await expect(page.getByTestId("pro-status")).toHaveAttribute("data-pro", "0");
    await expect(page.getByTestId("pro-not-configured")).toHaveCount(0);
    await expectNoSeriousA11yViolations(page);

    const buy = page.getByTestId("pro-buy-monthly");
    await expect(buy).toBeEnabled();
    await buy.click();

    // createCheckoutSession → (simulated) Stripe Checkout → back on the success URL, whose query
    // the page drops once handled (a reload must not replay it).
    await expect(page).toHaveURL(/\/pro(\?checkout=success&session_id=cs_emu\w+)?$/, {
      timeout: 20_000,
    });
    await expect(page).toHaveURL(/\/pro$/, { timeout: 20_000 });
    const banner = page.getByTestId("pro-return-success");
    await expect(banner).toBeVisible();
    await expect(banner).toHaveAttribute("data-state", "active", { timeout: 20_000 });
    await expect(banner).toContainText("Pro is active");
    await expect(page.getByTestId("pro-status")).toHaveAttribute("data-pro", "1");
    await expectNoSeriousA11yViolations(page);

    // Written by the server: the customer mapping (server-only) and the entitlement.
    const mapping = await getDoc(`users/${uid}/private/stripe`);
    expect(mapping?.customerId?.stringValue).toMatch(/^cus_emu/);
    const ent = await getDoc(`users/${uid}/private/entitlements`);
    expect(ent?.pro?.booleanValue).toBe(true);
    expect(ent?.source?.stringValue).toBe("subscription");
    // ...with the plan details (additive fields, from the subscription in "Stripe").
    expect(ent?.plan?.stringValue).toBe("monthly");
    expect(ent?.cancelAtPeriodEnd?.booleanValue).toBe(false);
    expect(ent?.status?.stringValue).toBe("active");
    const periodEnd = Number(ent?.currentPeriodEnd?.integerValue ?? 0);
    expect(periodEnd).toBeGreaterThan(Date.now() + 25 * 24 * 3600 * 1000);

    // You're Pro: the plan and renewal date, Manage subscription, no purchase buttons.
    const state = page.getByTestId("pro-pro-state");
    await expect(state).toBeVisible();
    await expect(state).toContainText("You're Pro");
    await expect(page.getByTestId("pro-pro-plan")).toHaveText("Monthly", { timeout: 15_000 });
    await expect(page.getByTestId("pro-pro-renewal")).toContainText("Renews on");
    await expect(page.locator('[data-testid^="pro-buy-"]')).toHaveCount(0);
    await expect(page.locator('[data-testid^="pro-plan-"]')).toHaveCount(0);
    await expect(page.getByTestId("pro-restore-purchases")).toBeVisible();
    await expectNoSeriousA11yViolations(page);

    // The same after a fresh load, and in Settings and Account.
    await page.goto("/pro");
    await expect(page.getByTestId("pro-pro-plan")).toHaveText("Monthly", { timeout: 15_000 });
    await page.goto("/settings");
    await expect(page.getByTestId("settings-pro-status")).toHaveText("Pro · Monthly", {
      timeout: 15_000,
    });
    await expect(page.getByTestId("settings-pro-manage")).toBeVisible();
    await page.goto("/account");
    await expect(page.getByTestId("account-pro-plan")).toHaveText("Pro · Monthly", {
      timeout: 15_000,
    });

    // Manage subscription opens the Billing Portal.
    await page.goto("/pro");
    await expect(page.getByTestId("pro-manage")).toBeEnabled({ timeout: 15_000 }); // signed in
    await page.getByTestId("pro-manage").click();
    await expect(page).toHaveURL(/\/pro\?portal=emulator$/, { timeout: 20_000 });
  });

  // @req PAY-002
  test("a canceled checkout shows a gentle note and changes nothing @emu", async ({ page }) => {
    await page.goto("/pro?pw=1&checkout=cancel");
    await expect(page.getByTestId("pro-return-cancel")).toContainText("Checkout canceled");
    await expect(page.getByTestId("pro-return-success")).toHaveCount(0);
    await expect(page.getByTestId("pro-status")).toHaveAttribute("data-pro", "0");
  });

  // @req PAY-004
  test("Restore purchases re-reads Stripe (Account and /pro, signed-in only) @emu", async ({
    page,
  }, info) => {
    await page.goto("/pro?pw=1");
    await expect(page.getByTestId("pro-restore")).toBeEnabled(); // guests: sign in to restore
    await expect(page.getByTestId("pro-restore-purchases")).toHaveCount(0);
    const uid = await signIn(page, "restore", info.project.name);
    await expect(page.getByTestId("pro-restore")).toHaveCount(0);
    await expect(page.getByTestId("pro-restore-purchases")).toBeVisible();

    // A subscription exists in Stripe that the app missed (e.g. a lost webhook).
    await seedStripeSubscription(uid);
    await expect(page.getByTestId("pro-status")).toHaveAttribute("data-pro", "0");
    await page.getByTestId("pro-restore-purchases").click();
    // The listener flips Pro: the plans give way to "You're Pro" (with its own Restore button).
    await expect(page.getByTestId("pro-status")).toHaveAttribute("data-pro", "1", {
      timeout: 15_000,
    });
    await expect(page.getByTestId("pro-pro-state")).toBeVisible();
    // Rate limit (once per 30 s): a second check right away is refused politely.
    await page.getByTestId("pro-restore-purchases").click();
    await expect(page.getByTestId("pro-restore-purchases-result")).toContainText(
      "Try again in a few seconds",
      { timeout: 15_000 },
    );

    // The same button in Account (same server limit).
    await page.goto("/account");
    await page.getByTestId("account-restore-purchases").click();
    await expect(page.getByTestId("account-restore-purchases-result")).toContainText(
      "Try again in a few seconds",
      { timeout: 15_000 },
    );
    await expect.poll(() => isPro(page), { timeout: 15_000 }).toBe(true);
  });

  // @req PAY-001
  test("with the paywall off (default) everything stays free, signed in or not @emu", async ({
    page,
  }, info) => {
    await page.goto("/pro");
    await signIn(page, "free", info.project.name);
    await expect(page.getByTestId("pro-status")).toHaveAttribute("data-policy", "ALL_FREE");
    await page.goto("/setup");
    await page.getByTestId("setup-next").click();
    await page.getByTestId("setup-players-8").click();
    await expect(page.getByTestId("setup-players-8")).toHaveAttribute("aria-checked", "true");
    await expect(page.getByTestId("paywall")).toHaveCount(0);
    await expect(page.getByLabel("Pro feature")).toHaveCount(0);
  });
});
