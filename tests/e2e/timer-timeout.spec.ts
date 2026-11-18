// @req TMR-030 @req TMR-031 @req TMR-023 @req TMR-040
// Appendix B Scenario 4 (grace → eliminated by time, the turn advances) and §9.5 visuals.
import { expect, test, type Page } from "@playwright/test";
import { menuTap } from "./support/menu";
import { gotoClockBoard, timerState } from "./support/timer";

async function setBank(page: Page, index: number, bankMs: number) {
  await page.evaluate(
    ([i, ms]) => {
      const g = window.__tcg!.getState().session!.game;
      window.__tcg!.dispatch({ type: "TIMER_SET", seatId: g.seats[i]!.id, bankMs: ms });
    },
    [index, bankMs] as const,
  );
}

test("Scenario 4: P2 at 0:05 with 0:10 grace → overtime (red) → eliminated by Time → P3 runs", async ({
  page,
}) => {
  await gotoClockBoard(page, "t.mode=bank&t.bankMs=600000&t.timeoutAction=grace&t.graceMs=10000");
  const p1 = (await timerState(page)).active;
  const p2 = (p1 + 1) % 4;
  const p3 = (p1 + 2) % 4;
  await menuTap(page, "timer-start");
  await page.getByTestId(`seat-${p1}-pass`).click();
  await setBank(page, p2, 5_000);
  // Under 10 s the chip shows tenths and is red.
  await expect(page.getByTestId(`seat-${p2}-clock-time`)).toHaveText("5.0");
  await page.clock.runFor(2_500);
  await expect(page.getByTestId(`seat-${p2}-clock-time`)).toHaveText("2.5");
  await expect(page.getByTestId(`seat-${p2}-clock`)).toHaveClass(/text-danger/);

  // 0:00 → overtime: grace countdown, red flashing tile border.
  await page.clock.runFor(2_600);
  await expect(page.getByTestId(`seat-${p2}-clock`)).toHaveAttribute("data-state", "overtime");
  await expect(page.getByTestId(`seat-${p2}-clock`)).toContainText("Overtime");
  await expect(page.getByTestId(`seat-${p2}-frame`)).toHaveAttribute("data-state", "overtime");
  await expect(page.getByTestId(`seat-${p2}-frame`)).toHaveClass(/ring-danger/);
  await page.clock.runFor(400);
  await expect(page.getByTestId(`seat-${p2}-clock-time`)).toHaveText(/^9\.\d$/);

  // Grace ends → eliminated with cause "Time"; the turn advances to P3 automatically.
  await page.clock.runFor(9_600);
  await expect(page.getByTestId(`seat-${p2}-eliminated`)).toBeVisible();
  const s = await timerState(page);
  expect(s.eliminated[p2]).toBe(true);
  expect(s.active).toBe(p3);
  expect(s.holder).toBe(s.seatIds[p3]);
  const cause = await page.evaluate(
    (id) => window.__tcg!.getState().session!.game.eliminations.find((e) => e.seatId === id)?.cause,
    s.seatIds[p2]!,
  );
  expect(cause?.kind).toBe("time");
  await expect(page.getByTestId(`seat-${p3}-clock`)).toHaveAttribute("data-running", "true");
  await expect(page.getByTestId(`seat-${p2}-timerbar`)).toHaveCount(0);
});

test("flag only: the clock keeps counting negative in red; nobody is eliminated", async ({
  page,
}) => {
  await gotoClockBoard(page, "t.mode=bank&t.bankMs=600000&t.timeoutAction=flag&t.showTenths=0");
  const a = (await timerState(page)).active;
  await menuTap(page, "timer-start");
  await setBank(page, a, 2_000);
  await page.clock.runFor(47_000);
  await expect(page.getByTestId(`seat-${a}-clock`)).toHaveAttribute("data-state", "flagged");
  await expect(page.getByTestId(`seat-${a}-clock-time`)).toHaveText("−0:45");
  await expect(page.getByTestId(`seat-${a}-clock`)).toContainText("Flag");
  expect((await timerState(page)).eliminated[a]).toBe(false);
});

test("add time once: a one-time extension with a notice", async ({ page }) => {
  await gotoClockBoard(
    page,
    "t.mode=bank&t.bankMs=600000&t.timeoutAction=addOnce&t.addOnceMs=60000",
  );
  const a = (await timerState(page)).active;
  await menuTap(page, "timer-start");
  await setBank(page, a, 1_000);
  await page.clock.runFor(1_500);
  await expect(page.getByTestId("snackbar")).toContainText("+1:00 added (once per game)");
  const s = await timerState(page);
  expect(s.eliminated[a]).toBe(false);
  expect(s.remaining[a]).toBe(60_000 - 500);
});

test("low-time warning flashes the seat (TMR-031)", async ({ page }) => {
  await gotoClockBoard(page, "t.mode=bank&t.bankMs=600000&t.warnings=60000");
  const a = (await timerState(page)).active;
  await menuTap(page, "timer-start");
  await setBank(page, a, 61_000);
  await expect(page.getByTestId(`seat-${a}-frame`)).not.toHaveClass(/ring-warning/);
  await page.clock.runFor(1_100);
  await expect(page.getByTestId(`seat-${a}-frame`)).toHaveClass(/ring-warning/);
  await expect(page.getByTestId(`seat-${a}-clock`)).toHaveAttribute("data-flash", "warning");
  // The flash ends by itself.
  await page.clock.runFor(2_000);
  await expect(page.getByTestId(`seat-${a}-clock`)).not.toHaveAttribute("data-flash", "warning");
});
