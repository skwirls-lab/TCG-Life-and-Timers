// @req SET-001 @req SET-010 @req SET-011 @req SET-012 @req SET-015 @req SET-030 @req GAME-013 @req A11Y-002
import { expect, test, type Page } from "@playwright/test";
import { expectNoSeriousA11yViolations } from "./support/axe";

const QUICK = "/settings?quick=mtg.commander&players=4&names=A,B,C,D&seed=3";

interface GameView {
  seats: { id: string; name: string }[];
  layoutId: string;
  startOverrides: Record<string, number>;
  values: Record<string, number>;
}

async function game(page: Page): Promise<GameView | null> {
  return page.evaluate(
    () => (window.__tcg?.getState().session?.game ?? null) as unknown as GameView | null,
  );
}

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

async function readActiveGame(
  page: Page,
): Promise<{ startOverrides: Record<string, number> } | null> {
  return page.evaluate(
    () =>
      new Promise<{ startOverrides: Record<string, number> } | null>((resolve) => {
        const req = indexedDB.open("tcg-life");
        req.onerror = () => resolve(null);
        req.onsuccess = () => {
          const db = req.result;
          try {
            const tx = db.transaction(["kv", "games"], "readonly");
            const ptr = tx.objectStore("kv").get("activeGameId");
            ptr.onsuccess = () => {
              const id = (ptr.result as { value?: string } | undefined)?.value;
              if (!id) return resolve(null);
              const row = tx.objectStore("games").get(id);
              row.onsuccess = () =>
                resolve(
                  (row.result as { game?: { startOverrides: Record<string, number> } } | undefined)
                    ?.game ?? null,
                );
            };
          } catch {
            resolve(null);
          } finally {
            db.close();
          }
        };
      }),
  );
}

async function openWithGame(page: Page, url = QUICK) {
  await page.goto(url);
  await expect(page.getByTestId("settings")).toBeVisible();
  await expect(page.getByTestId("settings-scope")).toContainText("current");
}

test("settings page is accessible", async ({ page }) => {
  await openWithGame(page);
  await expectNoSeriousA11yViolations(page);
  await page.getByTestId("setting-firstPlayerRule-help").click();
  await expect(page.getByTestId("setting-help")).toBeVisible();
  await expectNoSeriousA11yViolations(page);
});

test("changing players from 4 to 3 asks to confirm, then resets keeping names", async ({
  page,
}) => {
  await openWithGame(page);
  await page.getByTestId("setting-players-control-3").click();
  await expect(page.getByTestId("confirm-reset")).toBeVisible();
  await expect(page.getByTestId("confirm-reset")).toContainText(
    "This will reset the current game. Continue?",
  );
  await page.getByTestId("confirm-reset-cancel").click();
  await expect(page.getByTestId("confirm-reset")).toBeHidden();
  expect((await game(page))?.seats).toHaveLength(4);

  await page.getByTestId("setting-players-control-3").click();
  await page.getByTestId("confirm-reset-continue").click();
  await expect
    .poll(async () => (await game(page))?.seats.map((s) => s.name))
    .toEqual(["A", "B", "C"]);
  await expect(page.getByTestId("setting-players-control-3")).toHaveAttribute(
    "aria-checked",
    "true",
  );
});

test("card layout and layout variant apply live without a reset", async ({ page }) => {
  await openWithGame(page);
  const before = await game(page);
  await page.getByTestId("setting-cardLayout-control-nameOnly").click();
  await expect(page.getByTestId("setting-cardLayout-control-nameOnly")).toHaveAttribute(
    "aria-checked",
    "true",
  );
  await expect.poll(async () => (await readSetting(page, "app"))?.cardLayout).toBe("nameOnly");
  await page.getByTestId("setting-layout-control-topBottom").click();
  await expect(page.getByTestId("confirm-reset")).toHaveCount(0);
  await expect.poll(async () => (await game(page))?.layoutId).toBe("topBottom");
  expect((await game(page))?.seats.map((s) => s.id)).toEqual(before?.seats.map((s) => s.id));
});

test("starting life 30 via the chip resets life to 30", async ({ page }) => {
  await openWithGame(page);
  await page.getByTestId("setting-startValue-control-30").click();
  await page.getByTestId("confirm-reset-continue").click();
  await expect
    .poll(async () => {
      const g = await game(page);
      return g ? g.seats.map((s) => g.values[`mtg.life|${s.id}||`]) : null;
    })
    .toEqual([30, 30, 30, 30]);
});

test("custom starting value via the keypad", async ({ page }) => {
  await openWithGame(page);
  await page.getByTestId("setting-startValue-control-custom").click();
  const keypad = page.getByTestId("setting-startValue-control-keypad");
  await keypad.getByRole("button", { name: "Backspace" }).click();
  await keypad.getByRole("button", { name: "Backspace" }).click();
  await keypad.getByRole("button", { name: "3", exact: true }).click();
  await keypad.getByRole("button", { name: "5", exact: true }).click();
  await page.getByTestId("setting-startValue-control-keypad-submit").click();
  await page.getByTestId("confirm-reset-continue").click();
  await expect.poll(async () => (await game(page))?.startOverrides).toEqual({ "mtg.life": 35 });
});

test("save as default persists into the next new game", async ({ page }) => {
  await openWithGame(page);
  await page.getByTestId("setting-startValue-control-30").click();
  await page.getByTestId("confirm-reset-continue").click();
  await expect.poll(async () => (await game(page))?.startOverrides).toEqual({ "mtg.life": 30 });
  await page.getByTestId("setting-saveDefaults-control").click();
  await expect(
    page.getByTestId("snackbar").filter({ hasText: "Saved as default for Commander" }),
  ).toBeVisible();
  await expect
    .poll(async () => (await readSetting(page, "presetDefaults:mtg.commander"))?.startOverrides)
    .toEqual({ "mtg.life": 30 });

  await page.goto("/setup");
  for (let i = 0; i < 3; i++) await page.getByTestId("setup-next").click();
  await expect(page.getByTestId("setup-start-30")).toHaveAttribute("aria-checked", "true");
  await page.getByTestId("setup-start-game").click();
  await expect(page).toHaveURL(/\/play$/);
  await expect
    .poll(async () => (await readActiveGame(page))?.startOverrides)
    .toEqual({ "mtg.life": 30 });

  // Restore defaults clears them again.
  await page.goto("/settings");
  await page.getByTestId("setting-restoreDefaults-control").click();
  await expect.poll(async () => readSetting(page, "presetDefaults:mtg.commander")).toBeNull();
});

test("rows are shown or hidden per preset", async ({ page }) => {
  await openWithGame(page);
  await expect(page.getByTestId("setting-commanderDamageLifeLoss")).toBeVisible();
  await expect(page.getByTestId("setting-partnersAllowed")).toBeVisible();
  await expect(page.getByTestId("setting-planechase")).toHaveAttribute("data-disabled", "1");
  // TIMER-UI (W3): the real section-C mode row replaced the placeholder.
  await expect(page.getByTestId("setting-timer.mode")).toContainText("Timer mode");

  await openWithGame(page, "/settings?quick=mtg.constructed&players=2&names=A,B");
  await expect(page.getByTestId("setting-autoKO")).toBeVisible();
  await expect(page.getByTestId("setting-commanderDamageLifeLoss")).toHaveCount(0);
  await expect(page.getByTestId("setting-partnersAllowed")).toHaveCount(0);
  await expect(page.getByTestId("setting-startValue")).toContainText("Starting Life");
});

test("win/loss conditions sub-page edits thresholds with one confirm", async ({ page }) => {
  await openWithGame(page);
  await page.getByTestId("setting-thresholds-control").click();
  await expect(page.getByTestId("settings-sub-thresholds")).toBeVisible();
  await expectNoSeriousA11yViolations(page);
  await page.getByTestId("threshold-mtg.poison-value").getByRole("button", { name: /\+$/ }).click();
  await page.getByTestId("settings-sub-apply").click();
  await page.getByTestId("confirm-reset-continue").click();
  await expect
    .poll(async () =>
      page.evaluate(() => window.__tcg?.getState().session?.game.thresholdOverrides),
    )
    .toEqual({ "mtg.poison": 11 });
});

test("without a game, game rows edit the next game's defaults", async ({ page }) => {
  await page.goto("/settings");
  await expect(page.getByTestId("settings-scope")).toContainText("next");
  await page.getByTestId("setting-players-control-3").click();
  await expect(page.getByTestId("confirm-reset")).toHaveCount(0);
  await expect
    .poll(async () => (await readSetting(page, "presetDefaults:mtg.commander"))?.players)
    .toBe(3);
});
