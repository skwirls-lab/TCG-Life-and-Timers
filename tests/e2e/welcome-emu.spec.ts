// Sign-in first: the launcher's welcome screen and "Sign in to sync" entry against the emulators.
// @req AUTH-001 @req AUTH-003 @req A11Y-002
import { expect, test, type Page } from "@playwright/test";
import { expectNoSeriousA11yViolations } from "./support/axe";

const WELCOME_KEY = "tcg.welcome.v1";

async function authHooks(page: Page) {
  await page.waitForFunction(() => window.__tcgAuth !== undefined);
}

function uniqueEmail(label: string, project: string) {
  return `${label}-${project}-${Date.now()}@example.com`;
}

test.describe("welcome @emu", () => {
  test("first visit shows the welcome; the guest choice is remembered @emu", async ({ page }) => {
    await page.goto("/");
    const welcome = page.getByTestId("welcome");
    await expect(welcome).toBeVisible();
    await expect(welcome).toContainText("TCGTempo");
    await expect(page.getByTestId("welcome-google")).toBeEnabled();
    await expect(page.getByTestId("welcome-guest-note")).toContainText("don't sync");
    await expectNoSeriousA11yViolations(page);

    await page.getByTestId("welcome-guest").click();
    await expect(welcome).toHaveCount(0);
    // signed out: sign-in stays one tap away on the launcher
    await expect(page.getByTestId("launcher-signin")).toBeVisible();
    await expect(page.getByTestId("launcher-signin")).toContainText("Sign in to sync");
    await expectNoSeriousA11yViolations(page);

    await page.reload();
    await expect(page.getByTestId("launcher-account")).toHaveAttribute("data-view", "signIn");
    await expect(page.getByTestId("welcome")).toHaveCount(0);
    expect(await page.evaluate((k) => localStorage.getItem(k), WELCOME_KEY)).toContain("guest");
  });

  test("signing in from the welcome closes it for good @emu", async ({ page }, info) => {
    await page.goto("/");
    await expect(page.getByTestId("welcome")).toBeVisible();
    await authHooks(page);
    const email = uniqueEmail("welcome", info.project.name);
    await page.evaluate((e) => window.__tcgAuth!.signInForTests(e), email);
    await expect(page.getByTestId("welcome")).toHaveCount(0);
    await expect(page.getByTestId("launcher-account-link")).toBeVisible();
    await expect(page.getByTestId("launcher-signin")).toHaveCount(0);

    // after signing out, the welcome stays answered and the entry is back
    await page.evaluate(() => window.__tcgAuth!.signOut());
    await page.reload();
    await expect(page.getByTestId("launcher-account")).toHaveAttribute("data-view", "signIn");
    await expect(page.getByTestId("welcome")).toHaveCount(0);
  });

  test("a signed-in user never sees the welcome @emu", async ({ page }, info) => {
    // sign in somewhere else first, with no welcome answer stored on this device
    await page.goto("/account");
    await authHooks(page);
    const email = uniqueEmail("never", info.project.name);
    await page.evaluate((e) => window.__tcgAuth!.signInForTests(e), email);
    await expect(page.getByTestId("account-email")).toContainText(email);
    await page.evaluate((k) => localStorage.removeItem(k), WELCOME_KEY);

    // watch for the welcome from the very first frame of the launcher
    await page.addInitScript(() => {
      new MutationObserver(() => {
        if (document.querySelector('[data-testid="welcome"]'))
          (window as unknown as { __sawWelcome?: boolean }).__sawWelcome = true;
      }).observe(document, { childList: true, subtree: true });
    });
    await page.goto("/");
    await expect(page.getByTestId("launcher-account")).toHaveAttribute("data-view", "signedIn");
    expect(
      await page.evaluate(() => (window as unknown as { __sawWelcome?: boolean }).__sawWelcome),
    ).toBeFalsy();
  });
});
