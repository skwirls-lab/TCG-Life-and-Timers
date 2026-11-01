// @req GAME-001 @req GAME-016 @req LAY-005 @req PRE-003 @req A11Y-002
import { expect, test, type Page } from "@playwright/test";
import { expectNoSeriousA11yViolations } from "./support/axe";

interface StoredGame {
  id: string;
  seats: { id: string; name: string }[];
  startOverrides: Record<string, number>;
  preset: { id: string };
}

/** The active game persisted in IndexedDB (the /play board belongs to another lane). */
async function readActiveGame(page: Page): Promise<StoredGame | null> {
  return page.evaluate(
    () =>
      new Promise<StoredGame | null>((resolve) => {
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
                  ((row.result as { game?: StoredGame } | undefined)?.game ??
                    null) as StoredGame | null,
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

const NAMES = ["Conner", "Josh", "JP", "Bethany"];

async function startFromSetup(page: Page, names = NAMES) {
  await page.goto("/setup");
  await page.getByTestId("setup-next").click();
  await page.getByTestId("setup-next").click();
  for (const [i, name] of names.entries())
    await page.getByTestId(`setup-seat-${i}-name`).fill(name);
  await page.getByTestId("setup-start-game").click();
  await expect(page).toHaveURL(/\/play$/);
}

test("new game from the launcher in at most 6 taps", async ({ page }) => {
  await page.goto("/");
  let taps = 0;
  const tap = async (testId: string) => {
    taps++;
    await page.getByTestId(testId).click();
  };
  await tap("launcher-new");
  await expect(page.getByTestId("setup-step-preset")).toBeVisible();
  await expect(page.getByTestId("setup-preset-mtg.commander")).toHaveAttribute(
    "aria-checked",
    "true",
  );
  await tap("setup-next");
  await expect(page.getByTestId("setup-players-4")).toHaveAttribute("aria-checked", "true");
  await tap("setup-next");
  for (const [i, name] of NAMES.entries())
    await page.getByTestId(`setup-seat-${i}-name`).fill(name);
  await tap("setup-next");
  await expect(page.getByTestId("setup-step-options")).toBeVisible();
  await tap("setup-start-game");
  expect(taps).toBeLessThanOrEqual(6);
  await expect(page).toHaveURL(/\/play$/);
  await expect
    .poll(async () => (await readActiveGame(page))?.seats.map((s) => s.name))
    .toEqual(NAMES);
});

test("seats can be reordered and the start value changed before starting", async ({ page }) => {
  await page.goto("/setup");
  await page.getByTestId("setup-next").click();
  await page.getByTestId("setup-players-3").click();
  await page.getByTestId("setup-layout-default").click();
  await page.getByTestId("setup-next").click();
  for (const [i, name] of ["A", "B", "C"].entries())
    await page.getByTestId(`setup-seat-${i}-name`).fill(name);
  await page.getByTestId("setup-seat-0-down").click();
  await expect(page.getByTestId("setup-seat-0-name")).toHaveValue("B");
  await page.getByTestId("setup-next").click();
  await page.getByTestId("setup-start-30").click();
  await page.getByTestId("setup-start-game").click();
  await expect(page).toHaveURL(/\/play$/);
  await expect
    .poll(async () => (await readActiveGame(page))?.seats.map((s) => s.name))
    .toEqual(["B", "A", "C"]);
  expect((await readActiveGame(page))?.startOverrides).toEqual({ "mtg.life": 30 });
});

test("every setup step is accessible", async ({ page }) => {
  await page.goto("/setup");
  for (const step of ["preset", "players", "seats", "options"]) {
    await expect(page.getByTestId(`setup-step-${step}`)).toBeVisible();
    await expectNoSeriousA11yViolations(page);
    if (step !== "options") await page.getByTestId("setup-next").click();
  }
});

test("quick start: same as last game in 1 tap", async ({ page }) => {
  await startFromSetup(page, ["Ann", "Ben", "Cid", "Dee"]);
  await expect.poll(async () => (await readActiveGame(page))?.id).toBeTruthy();
  const first = (await readActiveGame(page))!;
  await page.goto("/");
  await expect(page.getByTestId("launcher-quick")).toBeVisible();
  await page.getByTestId("launcher-quick").click();
  await expect(page).toHaveURL(/\/play$/);
  await expect.poll(async () => (await readActiveGame(page))?.id).not.toBe(first.id);
  expect((await readActiveGame(page))?.seats.map((s) => s.name)).toEqual([
    "Ann",
    "Ben",
    "Cid",
    "Dee",
  ]);
});

test("resume card after reload (games persist in IndexedDB)", async ({ page }) => {
  await startFromSetup(page);
  await expect.poll(async () => (await readActiveGame(page))?.id).toBeTruthy();
  await page.goto("/");
  await page.reload();
  const resume = page.getByTestId("launcher-resume");
  await expect(resume).toBeVisible();
  await expect(page.getByTestId("launcher-resume-summary")).toContainText("Commander · 4 players");
  await resume.click();
  await expect(page).toHaveURL(/\/play$/);
});
