// Timer config in setup, preset defaults and next-game settings (D-058, §13.1-C).
// @req GAME-001 @req SET-012 @req TMR-001 @req SET-010
import { expect, test, type Page } from "@playwright/test";

const CORNER = { position: { x: 12, y: 12 } };

async function readSetting(page: Page, key: string): Promise<Record<string, unknown> | null> {
  return page.evaluate(
    (k) =>
      new Promise<Record<string, unknown> | null>((resolve) => {
        const req = indexedDB.open("tcg-life");
        req.onerror = () => resolve(null);
        req.onsuccess = () => {
          const db = req.result;
          try {
            const get = db.transaction("settings", "readonly").objectStore("settings").get(k);
            get.onsuccess = () =>
              resolve(
                (get.result as { value?: Record<string, unknown> } | undefined)?.value ?? null,
              );
          } catch {
            resolve(null);
          } finally {
            db.close();
          }
        };
      }),
    key,
  );
}

const storedTimer = async (page: Page) =>
  ((await readSetting(page, "presetDefaults:mtg.commander"))?.timer ?? null) as {
    mode?: string;
    bankMs?: number;
  } | null;

async function toOptions(page: Page) {
  await page.goto("/setup");
  await expect(page.getByTestId("setup")).toBeVisible();
  for (let i = 0; i < 3; i++) await page.getByTestId("setup-next").click();
  await expect(page.getByTestId("setup-clock")).toBeVisible();
}

async function dismissFirstPlayer(page: Page) {
  const overlay = page.getByTestId("first-player-overlay");
  for (let i = 0; i < 4 && (await overlay.count()) > 0; i++) {
    await page.getByTestId("first-player-skip").click(CORNER);
    await page.waitForTimeout(150);
  }
  await expect(overlay).toHaveCount(0);
}

// @req GAME-001 @req TMR-001 @req SET-012
test("setup with a 20-min chess clock → START and 20:00 clocks; saved as default it pre-fills", async ({
  page,
}) => {
  await toOptions(page);
  await expect(page.getByTestId("setup-clock-mode")).toHaveValue("off");
  await expect(page.getByTestId("setup-clock-bank")).toHaveCount(0);
  await page.getByTestId("setup-clock-mode").selectOption("bank");
  await page.getByTestId("setup-clock-bank-20").click();
  await expect(page.getByTestId("setup-clock-bank-20")).toHaveAttribute("aria-checked", "true");
  await expect(page.getByTestId("setup-clock-timeout")).toBeVisible();
  await page.getByTestId("setup-start-game").click();

  await expect(page).toHaveURL(/\/play$/);
  await expect.poll(() => page.evaluate(() => !!window.__tcg?.getState().session)).toBe(true);
  await dismissFirstPlayer(page);
  await expect(page.getByTestId("timer-start")).toBeVisible();
  await expect(page.getByTestId("seat-0-clock-time")).toHaveText("20:00");
  expect(
    await page.evaluate(() => window.__tcg!.getState().session!.game.timer.config.bankMs),
  ).toBe(20 * 60_000);

  // Save as default for Commander includes the clock (SET-012).
  await page.getByTestId("toolbar-settings").click();
  await expect(page.getByTestId("settings")).toBeVisible();
  await page.getByTestId("setting-saveDefaults-control").click();
  await expect.poll(() => storedTimer(page)).toMatchObject({ mode: "bank", bankMs: 20 * 60_000 });

  await toOptions(page);
  await expect(page.getByTestId("setup-clock-mode")).toHaveValue("bank");
  await expect(page.getByTestId("setup-clock-bank-20")).toHaveAttribute("aria-checked", "true");
});

// @req SET-010 @req SET-012
test("without a game, timer rows edit the next game's timer defaults", async ({ page }) => {
  await page.goto("/settings");
  await expect(page.getByTestId("settings-scope")).toContainText("next");
  const mode = page.getByTestId("setting-timer.mode-control");
  await expect(mode).toBeEnabled();
  await mode.selectOption("bank");
  await expect(page.getByTestId("setting-timer.bank")).toBeVisible();
  await page.getByTestId("setting-timer.bank-control-30").click();
  await expect.poll(() => storedTimer(page)).toMatchObject({ mode: "bank", bankMs: 30 * 60_000 });

  await toOptions(page);
  await expect(page.getByTestId("setup-clock-mode")).toHaveValue("bank");
  await expect(page.getByTestId("setup-clock-bank-30")).toHaveAttribute("aria-checked", "true");
});

// @req TMR-001
test("advanced clock modes in setup open the paywall when locked", async ({ page }) => {
  await page.goto("/setup?pw=1");
  await page.waitForFunction(() => window.__tcgPay?.state().policy === "TIERED");
  for (let i = 0; i < 3; i++) await page.getByTestId("setup-next").click();
  await page.getByTestId("setup-clock-mode").selectOption("perTurn");
  await expect(page.getByTestId("paywall")).toBeVisible();
  await page.getByTestId("paywall-close").click();
  await expect(page.getByTestId("setup-clock-mode")).toHaveValue("off");
});
