// @req TMR-005 @req TMR-006 @req TMR-007 @req TMR-008 @req TMR-010 @req TMR-011 @req TMR-041 @req TMR-042 @req TMR-002
// Appendix B Scenario 3 through the UI (page.clock).
import { expect, test } from "@playwright/test";
import { expectNoSeriousA11yViolations } from "./support/axe";
import { gotoClockBoard, mss, timerState } from "./support/timer";

const TEN_MIN = 600_000;

test("Scenario 3: clock with nested responses (remaining clocks to the second)", async ({
  page,
}) => {
  await gotoClockBoard(page, `t.mode=bank&t.bankMs=${TEN_MIN}&t.incrementMs=0`);
  const s0 = await timerState(page);
  const p1 = s0.active;
  const p2 = (p1 + 1) % 4;
  const p3 = (p1 + 2) % 4;
  const clock = (i: number) => page.getByTestId(`seat-${i}-clock-time`);

  // TMR-001: waiting chips before START.
  await expect(page.getByTestId(`seat-${p2}-clock`)).toContainText("Waiting to start");
  await page.getByTestId("timer-start").click();
  await expect(page.getByTestId(`seat-${p1}-clock`)).toHaveAttribute("data-running", "true");
  await expect(page.getByTestId(`seat-${p1}-clock`)).toHaveAttribute("data-holder", "true");

  // After 30 s, P3 responds: P1 paused at 9:30, P3 running.
  await page.clock.runFor(30_000);
  await page.getByTestId(`seat-${p3}-respond`).click();
  let s = await timerState(page);
  expect(s.remaining[p1]).toBe(TEN_MIN - 30_000);
  expect(s.holder).toBe(s.seatIds[p3]);
  await expect(clock(p3)).toHaveText("10:00");
  await expect(page.getByTestId(`seat-${p3}-clock`)).toHaveAttribute("data-responder", "true");
  await expect(page.getByTestId(`seat-${p3}-passback`)).toBeVisible();
  // Everyone else sees the banner (P1's own chip is replaced by it while P3 responds).
  await expect(page.getByTestId(`seat-${p1}-banner`)).toBeVisible();
  const p3Name = ["Conner", "Josh", "JP", "Bethany"][p3]!;
  await expect(page.getByTestId(`seat-${p2}-banner`)).toContainText(p3Name);

  // After 20 s, P1 responds (nested, stack depth 2).
  await page.clock.runFor(20_000);
  await expect(page.getByTestId(`seat-${p2}-banner`)).toContainText("0:20");
  await page.getByTestId(`seat-${p1}-respond`).click();
  s = await timerState(page);
  expect(s.stack).toEqual([s.seatIds[p3], s.seatIds[p1]]);
  expect(s.remaining[p3]).toBe(TEN_MIN - 20_000);
  await expect(page.getByTestId(`seat-${p2}-depth`)).toHaveText("⚡×2");
  // P3 (now under P1 on the stack) sees the banner for P1.
  await expect(page.getByTestId(`seat-${p3}-banner`)).toContainText(
    ["Conner", "Josh", "JP", "Bethany"][p1]!,
  );

  // After 10 s, P1 passes back → P3 resumes.
  await page.clock.runFor(10_000);
  await page.getByTestId(`seat-${p1}-passback`).click();
  s = await timerState(page);
  expect(s.remaining[p1]).toBe(TEN_MIN - 40_000);
  expect(s.holder).toBe(s.seatIds[p3]);

  // After 5 s, P3 passes back → P1 resumes.
  await page.clock.runFor(5_000);
  await page.getByTestId(`seat-${p3}-passback`).click();
  s = await timerState(page);
  expect(s.stack).toEqual([]);
  expect(s.holder).toBe(s.seatIds[p1]);
  expect(s.remaining[p3]).toBe(TEN_MIN - 25_000);

  // P1 plays 15 s more, then passes the turn → P2 runs.
  await page.clock.runFor(15_000);
  await page.getByTestId(`seat-${p1}-pass`).click();
  s = await timerState(page);
  expect(s.holder).toBe(s.seatIds[p2]);
  // Final banks: P1 = 10:00 − 30 − 10 − 15 = 9:05, P3 = 9:35, P2 and P4 untouched.
  expect(s.remaining[p1]).toBe(TEN_MIN - 55_000);
  expect(s.remaining[p3]).toBe(TEN_MIN - 25_000);
  expect(s.remaining[p2]).toBe(TEN_MIN);
  expect(s.remaining[(p1 + 3) % 4]).toBe(TEN_MIN);
  await expect(clock(p1)).toHaveText(mss(TEN_MIN - 55_000));
  await expect(clock(p3)).toHaveText(mss(TEN_MIN - 25_000));
  await expect(clock(p2)).toHaveText("10:00");
  await page.clock.runFor(2_000);
  await expect(clock(p2)).toHaveText("9:58");

  // TMR-011: tapping the holder's chip only shows the details (reduced motion: no pulse).
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.getByTestId(`seat-${p2}-clock`).click();
  await expect(page.getByTestId(`seat-${p2}-clock-peek`)).toContainText("9:58 left");
  expect((await timerState(page)).holder).toBe(s.seatIds[p2]);
  await page.clock.runFor(2_100);
  await expect(page.getByTestId(`seat-${p2}-clock-peek`)).toHaveCount(0);

  // G-A11Y with clocks running (axe needs real timers: let time flow).
  await page.clock.resume();
  await expectNoSeriousA11yViolations(page);
});

for (const players of [2, 4]) {
  test(`TMR-042: the holder's time is at least 1/3 of the primary number (${players} players)`, async ({
    page,
  }) => {
    await gotoClockBoard(page, `t.mode=bank&t.bankMs=${TEN_MIN}`, players);
    const a = (await timerState(page)).active;
    await page.getByTestId("timer-start").click();
    const sizes = await page.evaluate((i) => {
      const fs = (id: string) =>
        parseFloat(getComputedStyle(document.querySelector(`[data-testid="${id}"]`)!).fontSize);
      return {
        number: fs(`seat-${i}-value`),
        clock: parseFloat(
          getComputedStyle(
            document.querySelector(`[data-testid="seat-${i}-clock-time"]`)!.parentElement!,
          ).fontSize,
        ),
      };
    }, a);
    expect(sizes.clock * 3).toBeGreaterThanOrEqual(sizes.number);
  });
}

test("freeze mode charges nobody (TMR-010)", async ({ page }) => {
  await gotoClockBoard(page, `t.mode=bank&t.bankMs=${TEN_MIN}&t.responses=freeze`);
  const a = (await timerState(page)).active;
  await page.getByTestId("timer-start").click();
  await page.clock.runFor(10_000);
  await page.getByTestId(`seat-${(a + 1) % 4}-respond`).click();
  await page.clock.runFor(20_000);
  const s = await timerState(page);
  expect(s.remaining[a]).toBe(TEN_MIN - 10_000);
  expect(s.remaining[(a + 1) % 4]).toBe(TEN_MIN);
});

test("responses 'disabled' hides Respond (TMR-010)", async ({ page }) => {
  await gotoClockBoard(page, `t.mode=bank&t.bankMs=${TEN_MIN}&t.responses=disabled`);
  await page.getByTestId("timer-start").click();
  await expect(page.locator('[data-testid$="-respond"]')).toHaveCount(0);
});
