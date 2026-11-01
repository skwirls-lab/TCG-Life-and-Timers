// T8.4 security headers (PRD §19.6): response headers + zero CSP violations in a broad smoke.
// @req LEG-001 @req LEG-002 @req LEG-006
import { expect, test, type Page } from "@playwright/test";

const QUICK = "/play?quick=mtg.commander&players=4&seed=7&names=Conner,Josh,JP,Bethany";

for (const path of ["/", "/play", "/privacy", "/terms", "/whats-new"]) {
  test(`security headers on ${path}`, async ({ request }) => {
    const res = await request.get(path);
    expect(res.status()).toBe(200);
    const h = res.headers();
    const csp = h["content-security-policy"] ?? "";
    expect(csp).toContain("default-src 'self'");
    expect(csp).toContain("frame-ancestors 'none'");
    expect(csp).toContain("object-src 'none'");
    expect(csp).toContain("https://api.scryfall.com");
    expect(csp).not.toContain("'unsafe-eval'");
    expect(h["strict-transport-security"]).toMatch(/max-age=\d+/);
    expect(h["x-content-type-options"]).toBe("nosniff");
    expect(h["referrer-policy"]).toBe("strict-origin-when-cross-origin");
    expect(h["x-frame-options"]).toBe("DENY");
    expect(h["permissions-policy"]).toContain("camera=(self)");
    expect(h["permissions-policy"]).toContain("microphone=()");
    expect(h["permissions-policy"]).toContain("geolocation=()");
    expect(h["x-powered-by"]).toBeUndefined();
  });
}

test("the service worker script is served uncached with the site CSP", async ({ request }) => {
  const res = await request.get("/serwist/sw.js");
  expect(res.status()).toBe(200);
  expect(res.headers()["cache-control"]).toBe("no-cache, no-store, must-revalidate");
  expect(res.headers()["content-type"]).toContain("javascript");
  expect(res.headers()["content-security-policy"]).toContain("default-src 'self'");
});

/** Records `securitypolicyviolation` events and CSP console errors for the whole session. */
async function watchCsp(page: Page): Promise<() => Promise<string[]>> {
  const consoleErrors: string[] = [];
  page.on("console", (m) => {
    const text = m.text();
    if (/Content[- ]Security[- ]Policy|violates the following/i.test(text))
      consoleErrors.push(text);
  });
  await page.addInitScript(() => {
    const w = window as unknown as { __csp: string[] };
    w.__csp = [];
    document.addEventListener("securitypolicyviolation", (e) => {
      w.__csp.push(
        `${e.violatedDirective} blocked ${e.blockedURI} (${e.sourceFile}:${e.lineNumber})`,
      );
    });
  });
  const violations: string[] = [];
  page.on("framenavigated", () => undefined);
  const collect = async () => {
    try {
      violations.push(
        ...(await page.evaluate(() => (window as unknown as { __csp?: string[] }).__csp ?? [])),
      );
    } catch {
      // navigation in flight; the next collect picks it up
    }
  };
  return async () => {
    await collect();
    return [...violations, ...consoleErrors];
  };
}

test("no CSP violations across a broad smoke of the app", async ({ page }) => {
  test.setTimeout(90_000);
  const report = await watchCsp(page);
  const seen: string[] = [];
  const visit = async (path: string, testId: string) => {
    await page.goto(path);
    await expect(page.getByTestId(testId)).toBeVisible();
    seen.push(...(await report()));
  };

  await visit("/", "launcher");
  await page.getByTestId("launcher-new").click();
  await expect(page).toHaveURL(/\/setup$/);
  seen.push(...(await report()));

  await visit(QUICK, "board");
  await page.getByTestId("seat-0-plus").click();
  await page.getByTestId("seat-0-name").click();
  await expect(page.getByTestId("seat-menu")).toBeVisible();
  await page.getByTestId("seat-menu-close").click();
  seen.push(...(await report()));

  await visit("/tools", "tools-page");
  await visit("/history", "history-page");
  await visit("/settings", "settings");
  await visit("/builder", "builder-list");
  await visit("/images", "images-page");
  await visit("/about", "about-page");
  await visit("/privacy", "legal-privacy");
  await visit("/terms", "legal-terms");
  await visit("/whats-new", "whats-new");
  await visit("/account", "account-page");
  await visit("/pro", "pro-page");
  expect(seen).toEqual([]);
});

test("privacy and terms are drafts covering the required topics, linked from About", async ({
  page,
}) => {
  await page.goto("/about");
  await page.getByTestId("about-privacy").click();
  await expect(page).toHaveURL(/\/privacy$/);
  await expect(page.getByTestId("legal-draft")).toHaveText(/Draft — requires owner\/legal review/);
  for (const id of [
    "device",
    "account",
    "analytics",
    "location",
    "retention",
    "rights",
    "ads",
    "children",
  ]) {
    await expect(page.getByTestId(`legal-section-${id}`)).toBeVisible();
  }
  await expect(page.getByTestId("legal-section-account")).toContainText("email address");
  await expect(page.getByTestId("legal-section-children")).toContainText("under 13");
  await expect(page.getByTestId("consent-status")).toHaveAttribute("data-state", "unconfigured");
  await page.getByTestId("legal-about-link").click();
  await expect(page).toHaveURL(/\/about$/);
  await expect(page.getByTestId("about-disclaimer")).toContainText(/not affiliated/i);
  await page.goto("/terms");
  await expect(page.getByTestId("legal-draft")).toBeVisible();
  await expect(page.getByTestId("legal-section-account")).toContainText("13");
  await expect(page.getByTestId("legal-section-fan")).toContainText("not affiliated");
});
