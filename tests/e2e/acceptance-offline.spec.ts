// PRD Appendix B Scenario 6 (offline): after one online visit, airplane mode → open the app →
// start a new game, play and finish it → the history record is stored locally.
// @req ARCH-001 @req PWA-002 @req ENV-001 @req HIST-003
import { expect, test } from "@playwright/test";

test("Scenario 6: a full game offline, recorded in history", async ({ page, context }) => {
  // One online visit installs the service worker and caches the app shell.
  await page.goto("/");
  await expect(page.getByTestId("launcher")).toBeVisible();
  await page.waitForFunction(
    async () => !!(await navigator.serviceWorker.getRegistration())?.active,
    undefined,
    {
      timeout: 20_000,
    },
  );
  await page.reload();
  await page.waitForFunction(() => !!navigator.serviceWorker.controller, undefined, {
    timeout: 20_000,
  });
  // Visit the main screens once so navigations are cached (a normal first session does this).
  for (const path of ["/setup", "/play", "/history", "/"]) {
    await page.goto(path);
    await page.waitForLoadState("networkidle");
  }

  await context.setOffline(true);
  await page.goto("/");
  await expect(page.getByTestId("launcher")).toBeVisible();
  await page.goto("/setup");
  await expect(page.getByTestId("setup-step-preset")).toBeVisible();
  await page.getByTestId("setup-next").click();
  await page.getByTestId("setup-players-2").click();
  await page.getByTestId("setup-next").click();
  await page.getByTestId("setup-seat-0-name").fill("Ana");
  await page.getByTestId("setup-seat-1-name").fill("Ben");
  await page.getByTestId("setup-start-game").click();
  await expect(page).toHaveURL(/\/play$/);
  await expect(page.getByTestId("board")).toBeVisible();

  // Play: real taps, then finish the game.
  const ben = page.getByTestId("seat-1-name");
  await expect(ben).toHaveText("Ben");
  await page.getByTestId("seat-1-minus").click();
  await page.evaluate(() => {
    const s = window.__tcg!.getState().session!.game;
    const life = s.preset.counters.find((c) => c.isPrimary)!.id;
    window.__tcg!.dispatch({
      type: "COUNTER_ADD",
      counterId: life,
      seatId: s.seats[1]!.id,
      delta: -100,
    });
  });
  await expect(page.getByTestId("game-over")).toBeVisible();

  // The record is stored locally (Past Games lists it) while still offline.
  await page.goto("/history");
  await page.getByTestId("history-segment-past").click();
  await expect(page.getByTestId("game-card").first()).toBeVisible();
  await expect(page.getByTestId("game-card-winner").first()).toContainText("Ana");
  await context.setOffline(false);
});
