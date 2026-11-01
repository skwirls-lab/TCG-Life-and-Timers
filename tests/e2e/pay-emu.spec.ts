// Stripe checkout + entitlements against the emulators (T7.1, T7.2). The extension is simulated
// by writing its docs with emulator owner access (instructions §6.3 fallback).
// @req PAY-002 @req PAY-003 @req PAY-004 @req A11Y-002
import { expect, test, type Page } from "@playwright/test";
import { expectNoSeriousA11yViolations } from "./support/axe";

const FIRESTORE = "http://127.0.0.1:8080/v1/projects/demo-tcg-life/databases/(default)/documents";
const OWNER = { Authorization: "Bearer owner", "Content-Type": "application/json" };

type FsValue = { stringValue?: string; booleanValue?: boolean; timestampValue?: string };
interface FsDoc {
  name: string;
  fields: Record<string, FsValue>;
}

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

async function listDocs(path: string): Promise<FsDoc[]> {
  const res = await fetch(`${FIRESTORE}/${path}`, { headers: OWNER });
  const body = (await res.json()) as { documents?: FsDoc[] };
  return body.documents ?? [];
}

async function signIn(page: Page, label: string, project: string): Promise<string> {
  await page.waitForFunction(() => window.__tcgAuth !== undefined);
  const email = `${label}-${project}-${Date.now()}@example.com`;
  await page.evaluate((e) => window.__tcgAuth!.signInForTests(e), email);
  await page.waitForFunction(() => !!window.__tcgAuth!.auth().user);
  return page.evaluate(() => window.__tcgAuth!.auth().user!.uid);
}

const isPro = (page: Page) => page.evaluate(() => window.__tcgPay?.state().pro ?? null);

async function grantPro(uid: string) {
  // What the Stripe extension + syncEntitlements would write for an active subscription.
  await patchDoc(`customers/${uid}/subscriptions/sub_e2e`, { status: { stringValue: "active" } });
  await patchDoc(`users/${uid}/private/entitlements`, {
    pro: { booleanValue: true },
    source: { stringValue: "subscription" },
    updatedAt: { timestampValue: new Date().toISOString() },
  });
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

  // @req PAY-002 @req A11Y-002
  test("checkout writes a checkout_sessions doc and follows the extension's url @emu", async ({
    page,
  }, info) => {
    await page.route("https://example.com/**", (route) =>
      route.fulfill({ status: 200, contentType: "text/html", body: "<title>Stripe</title>" }),
    );
    await page.goto("/pro?pw=1");
    const uid = await signIn(page, "checkout", info.project.name);
    await expect(page.getByTestId("pro-status")).toHaveAttribute("data-policy", "TIERED");
    await expect(page.getByTestId("pro-not-configured")).toHaveCount(0);
    await expectNoSeriousA11yViolations(page);

    const buy = page.getByTestId("pro-buy-yearly");
    await expect(buy).toBeEnabled();
    await buy.click();
    await expect(page.getByTestId("pro-status-text")).toBeVisible();

    let sessions: FsDoc[] = [];
    await expect
      .poll(async () => (sessions = await listDocs(`customers/${uid}/checkout_sessions`)).length, {
        timeout: 15_000,
      })
      .toBe(1);
    const f = sessions[0]!.fields;
    expect(f.price?.stringValue).toBe("price_e2eYearly");
    expect(f.mode?.stringValue).toBe("subscription");
    expect(f.success_url?.stringValue).toMatch(/^http:\/\/127\.0\.0\.1:\d+\/pro\?status=success$/);
    expect(f.cancel_url?.stringValue).toMatch(/\/pro\?status=cancel$/);

    // The extension answers with the Checkout url → the app navigates there.
    const docPath = sessions[0]!.name.split("/documents/")[1]!;
    await patchDoc(docPath, { url: { stringValue: "https://example.com/stripe" } });
    await expect(page).toHaveURL("https://example.com/stripe", { timeout: 15_000 });
  });

  // @req PAY-002 @req PAY-004
  test("checkout return states and Manage subscription for a Pro user @emu", async ({
    page,
  }, info) => {
    await page.goto("/pro?pw=1&status=success");
    await expect(page.getByTestId("pro-return-success")).toBeVisible();
    await expect(page.getByTestId("pro-restore")).toBeEnabled();
    const uid = await signIn(page, "manage", info.project.name);
    await expect(page.getByTestId("pro-restore")).toHaveCount(0);
    await grantPro(uid);
    await expect(page.getByTestId("pro-status")).toHaveAttribute("data-pro", "1", {
      timeout: 15_000,
    });
    // The portal callable doesn't exist in the emulators: the button explains it's unavailable.
    await page.getByTestId("pro-manage").click();
    await expect(page.getByTestId("pro-status-text")).toContainText("not available", {
      timeout: 15_000,
    });
  });
});
