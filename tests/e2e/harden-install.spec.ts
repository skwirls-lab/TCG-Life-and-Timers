// T8.7 install UX + What's new.
// @req PWA-003 @req SET-043
import { expect, test, type Page } from "@playwright/test";

/** Fires a synthetic `beforeinstallprompt` (Chromium only fires the real one when installable). */
async function fireInstallPrompt(page: Page, outcome: "accepted" | "dismissed" = "accepted") {
  await page.evaluate((o) => {
    const w = window as unknown as { __promptCalls: number };
    w.__promptCalls = 0;
    const e = new Event("beforeinstallprompt", { cancelable: true }) as Event & {
      prompt: () => Promise<void>;
      userChoice: Promise<{ outcome: string }>;
    };
    e.prompt = async () => {
      w.__promptCalls += 1;
    };
    e.userChoice = Promise.resolve({ outcome: o });
    window.dispatchEvent(e);
  }, outcome);
}

async function completeAGame(page: Page) {
  // Test builds: the install offer is opt-in per tab (?install=1).
  await page.goto("/play?quick=mtg.commander&players=2&seed=7&install=1");
  await expect(page.getByTestId("board")).toBeVisible();
  await page.evaluate(() => {
    const s = window.__tcg!.getState().session!.game.seats;
    window.__tcg!.dispatch({ type: "ELIMINATE", seatId: s[1]!.id } as never);
  });
  await expect
    .poll(() => page.evaluate(() => window.__tcg!.getState().session!.game.status))
    .toBe("ended");
  await expect
    .poll(() =>
      page.evaluate(() => JSON.parse(localStorage.getItem("tcg.install.v1") ?? "{}").completedGame),
    )
    .toBe(true);
}

const isIos = (page: Page) =>
  page.evaluate(
    () => /iPhone|iPad/.test(navigator.userAgent) && /Safari\//.test(navigator.userAgent),
  );

test("never offered on first open, even when the browser allows installing", async ({ page }) => {
  await page.goto("/?install=1");
  await expect(page.getByTestId("launcher")).toBeVisible();
  await fireInstallPrompt(page);
  await expect(page.getByTestId("install-prompt")).toHaveCount(0);
  await page.reload();
  await expect(page.getByTestId("launcher")).toBeVisible();
  await fireInstallPrompt(page);
  await expect(page.getByTestId("install-prompt")).toHaveCount(0);
});

test("offered on the launcher only, not on other screens", async ({ page }) => {
  await completeAGame(page);
  await page.goto("/settings");
  await expect(page.getByTestId("settings")).toBeVisible();
  await fireInstallPrompt(page);
  await expect(page.getByTestId("install-prompt")).toHaveCount(0);
  await page.goto("/");
  await fireInstallPrompt(page);
  await expect(page.getByTestId("install-prompt")).toBeVisible();
});

test("offered after the first completed game, never over the board", async ({ page }) => {
  await completeAGame(page);
  await fireInstallPrompt(page);
  await expect(page.getByTestId("install-prompt")).toHaveCount(0); // on /play
  await page.goto("/");
  await expect(page.getByTestId("launcher")).toBeVisible();
  await fireInstallPrompt(page);
  const card = page.getByTestId("install-prompt");
  await expect(card).toBeVisible();
  if (await isIos(page)) {
    await expect(card).toHaveAttribute("data-offer", "ios");
    await page.getByTestId("install-accept").click();
    const sheet = page.getByTestId("install-ios-sheet");
    await expect(sheet).toBeVisible();
    await expect(sheet).toContainText("Add to Home Screen");
    await page.getByTestId("install-ios-done").click();
    await expect(sheet).toHaveCount(0);
  } else {
    await expect(card).toHaveAttribute("data-offer", "prompt");
    await page.getByTestId("install-accept").click();
    await expect
      .poll(() =>
        page.evaluate(() => (window as unknown as { __promptCalls: number }).__promptCalls),
      )
      .toBe(1);
  }
  await expect(card).toHaveCount(0);
});

test("'Not now' is remembered", async ({ page }) => {
  await completeAGame(page);
  await page.goto("/");
  await fireInstallPrompt(page);
  await page.getByTestId("install-dismiss").click();
  await expect(page.getByTestId("install-prompt")).toHaveCount(0);
  await page.reload();
  await expect(page.getByTestId("launcher")).toBeVisible();
  await fireInstallPrompt(page);
  await expect(page.getByTestId("install-prompt")).toHaveCount(0);
});

test("What's new shows the 1.0.0 release notes (linked from Settings)", async ({ page }) => {
  await page.goto("/settings");
  await page.getByTestId("setting-whatsNew-control").click();
  await expect(page).toHaveURL(/\/whats-new$/);
  await expect(page.getByTestId("whats-new")).toBeVisible();
  const release = page.getByTestId("release-1.0.0");
  await expect(release).toBeVisible();
  await expect(release.getByRole("heading", { level: 2 })).toContainText("Version 1.0.0");
  await expect(release.getByRole("listitem").first()).toBeVisible();
  await expect(page.getByTestId("whats-new-installed")).toContainText("Installed version");
});
