// @req TMR-005 @req TMR-021 @req TMR-031
// Declare-blockers window (lane/timers): Attack on the attacker's tile pauses their clock and
// starts a shared countdown shown on every tile; Blockers declared gives the time back.
import { expect, test, type Page } from "@playwright/test";
import { expectNoSeriousA11yViolations } from "./support/axe";
import { gotoClockBoard, mss, setHidden, storedTimer, timerState } from "./support/timer";

const TEN = 600_000;
const SHOTS = "artifacts/timers";

async function blockers(page: Page) {
  return page.evaluate(() => {
    const t = window.__tcg!.getState().session!.game.timer;
    return t.blockers ?? null;
  });
}

async function startAndAttack(page: Page, params = "") {
  await gotoClockBoard(page, `t.mode=bank&t.bankMs=${TEN}${params}`);
  const p1 = (await timerState(page)).active;
  await page.getByTestId("timer-start").click();
  await page.clock.runFor(10_000);
  await page.getByTestId(`seat-${p1}-attack`).click();
  return p1;
}

test("Attack → countdown on every tile → Blockers declared returns the attacker's clock", async ({
  page,
}, info) => {
  const p1 = await startAndAttack(page);
  const p2 = (p1 + 1) % 4;
  expect((await blockers(page))?.durationMs).toBe(30_000);
  for (let i = 0; i < 4; i++) await expect(page.getByTestId(`seat-${i}-blockers`)).toBeVisible();
  await expect(page.getByTestId(`seat-${p2}-blockers-time`)).toHaveText("0:30");
  await page.clock.runFor(12_000);
  await expect(page.getByTestId(`seat-${p2}-blockers-time`)).toHaveText("0:18");
  // The attacker's clock did not run during the window.
  let s = await timerState(page);
  expect(s.remaining[p1]).toBe(TEN - 10_000);
  await page.screenshot({ path: `${SHOTS}/blockers-window-${info.project.name}.png` });
  // A defender declares blockers on their own tile.
  await page.getByTestId(`seat-${p2}-declared`).click();
  expect(await blockers(page)).toBeNull();
  await expect(page.getByTestId(`seat-${p1}-blockers`)).toHaveCount(0);
  await page.clock.runFor(5_000);
  s = await timerState(page);
  expect(s.remaining[p1]).toBe(TEN - 15_000);
  await expect(page.getByTestId(`seat-${p1}-clock-time`)).toHaveText(mss(TEN - 15_000));
  // History: "<name> declared attackers · blockers 0:12".
  const log = await page.evaluate(() =>
    window
      .__tcg!.getState()
      .session!.game.log.filter((e) => e.kind === "timer")
      .map((e) => e.meta?.action),
  );
  expect(log).toEqual(expect.arrayContaining(["blockersStart", "blockersEnd"]));
  await page.clock.resume();
  await expectNoSeriousA11yViolations(page);
});

test("timeout alert keeps waiting by default; 'return' rule hands the clock back", async ({
  page,
}) => {
  const p1 = await startAndAttack(page, "&t.blockersMs=20000");
  const p3 = (p1 + 2) % 4;
  await page.clock.runFor(21_000);
  await expect(page.getByTestId(`seat-${p3}-blockers`)).toHaveAttribute("data-up", "true");
  await expect(page.getByTestId(`seat-${p3}-blockers`)).toContainText(/time (is )?up/i);
  expect(await blockers(page)).toMatchObject({ remainingMs: 0, expired: true });
  // Nobody's bank runs while waiting.
  await page.clock.runFor(30_000);
  expect((await timerState(page)).remaining[p1]).toBe(TEN - 10_000);
  await page.getByTestId(`seat-${p1}-declared`).click();
  expect(await blockers(page)).toBeNull();
});

test("auto-return rule: at 0:00 the attacker's clock runs again", async ({ page }, info) => {
  const p1 = await startAndAttack(page, "&t.blockersMs=20000&t.blockersTimeout=return");
  await page.clock.runFor(20_500);
  await expect.poll(() => blockers(page)).toBeNull();
  await expect(page.getByTestId(`seat-${p1}-blockers`)).toHaveCount(0);
  await page.screenshot({ path: `${SHOTS}/blockers-returned-${info.project.name}.png` });
  await page.clock.runFor(4_500);
  expect((await timerState(page)).remaining[p1]).toBe(TEN - 15_000);
});

test("a Respond during the window pauses it; Pass back resumes it", async ({ page }) => {
  const p1 = await startAndAttack(page);
  const p3 = (p1 + 2) % 4;
  await page.clock.runFor(5_000);
  await page.getByTestId(`seat-${p3}-respond`).click();
  // The response banner replaces the countdown; the responder's clock runs.
  await expect(page.getByTestId(`seat-${p1}-banner`)).toBeVisible();
  await page.clock.runFor(8_000);
  let s = await timerState(page);
  expect(s.remaining[p3]).toBe(TEN - 8_000);
  expect((await blockers(page))?.remainingMs).toBe(25_000);
  await page.getByTestId(`seat-${p3}-passback`).click();
  await expect(page.getByTestId(`seat-${p3}-blockers-time`)).toHaveText("0:25");
  await page.clock.runFor(5_000);
  await expect(page.getByTestId(`seat-${p3}-blockers-time`)).toHaveText("0:20");
  s = await timerState(page);
  expect(s.remaining[p1]).toBe(TEN - 10_000);
  // Passing the turn during the window ends it first.
  await page.getByTestId(`seat-${p1}-pass`).click();
  expect(await blockers(page)).toBeNull();
  expect((await timerState(page)).active).toBe((p1 + 1) % 4);
});

test("reload mid-window restores the window (auto-pause on background)", async ({ page }) => {
  const p1 = await startAndAttack(page);
  await page.clock.runFor(8_000);
  await setHidden(page, true);
  await expect.poll(async () => (await storedTimer(page))?.status).toBe("paused");
  await page.clock.runFor(60_000);
  await page.goto("/play");
  await expect(page.getByTestId("timer-paused")).toBeVisible();
  await page.getByTestId("timer-resume").click();
  await expect(page.getByTestId(`seat-${p1}-blockers-time`)).toHaveText("0:22");
  await page.clock.runFor(2_000);
  await expect(page.getByTestId(`seat-${p1}-blockers-time`)).toHaveText("0:20");
  expect((await timerState(page)).remaining[p1]).toBe(TEN - 10_000);
});

test("reload mid-window without auto-pause accounts for the elapsed time", async ({ page }) => {
  const p1 = await startAndAttack(page, "&t.autoPauseBackground=0");
  await page.clock.runFor(5_000);
  await expect.poll(async () => (await storedTimer(page))?.status).toBe("running");
  await expect
    .poll(async () =>
      page.evaluate(
        () =>
          new Promise<boolean>((resolve) => {
            const req = indexedDB.open("tcg-life");
            req.onsuccess = () => {
              const tx = req.result.transaction(["kv", "games"], "readonly");
              const ptr = tx.objectStore("kv").get("activeGameId");
              ptr.onsuccess = () => {
                const row = tx.objectStore("games").get(ptr.result.value);
                row.onsuccess = () => resolve(!!row.result?.game?.timer?.blockers);
              };
            };
          }),
      ),
    )
    .toBe(true);
  await page.goto("/play");
  await expect(page.getByTestId("seat-0")).toBeVisible();
  // Wall time kept running across the reload; the window shows what is left.
  const left = (await blockers(page))!;
  const shown = await page.getByTestId(`seat-${p1}-blockers-time`).textContent();
  expect(left.durationMs).toBe(30_000);
  expect(Number(shown!.split(":")[1])).toBeLessThanOrEqual(25);
  expect((await timerState(page)).remaining[p1]).toBe(TEN - 10_000);
});

test("Settings: the blockers toggle turns Attack off", async ({ page }) => {
  await gotoClockBoard(page, `t.mode=bank&t.bankMs=${TEN}&t.blockersWindow=0`);
  const p1 = (await timerState(page)).active;
  await page.getByTestId("timer-start").click();
  await expect(page.getByTestId(`seat-${p1}-pass`)).toBeVisible();
  await expect(page.getByTestId(`seat-${p1}-attack`)).toHaveCount(0);
});
