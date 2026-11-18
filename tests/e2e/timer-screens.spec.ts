// @req TMR-041 @req TMR-042 (G-VISUAL captures of running clocks; not assertions)
import { mkdirSync } from "node:fs";
import { expect, test } from "@playwright/test";
import { menuTap } from "./support/menu";

const NAMES = "Conner,Josh,JP,Bethany";
const VIEWPORTS = [
  { w: 360, h: 740 },
  { w: 915, h: 412 },
];

test("capture running clock boards (holder + responder) for 2 and 4 players", async ({
  page,
}, info) => {
  if (info.project.name !== "pixel7") return;
  test.setTimeout(120_000);
  mkdirSync("artifacts/screens", { recursive: true });
  await page.clock.install();
  for (const vp of VIEWPORTS) {
    await page.setViewportSize({ width: vp.w, height: vp.h });
    for (const n of [2, 4]) {
      await page.goto(
        `/play?quick=mtg.commander&players=${n}&seed=7&names=${NAMES}&s.hideSystemBars=0&t.mode=bank&t.bankMs=1200000`,
      );
      await expect(page.getByTestId("center-menu")).toHaveAttribute("data-clock", "start");
      await page.screenshot({ path: `artifacts/screens/timer-${n}p-waiting-${vp.w}x${vp.h}.png` });
      await menuTap(page, "timer-start");
      await page.clock.runFor(42_000);
      // Seat 1 responds: the active seat is paused, the responder runs, the others see the banner.
      const active = await page.evaluate(() => {
        const g = window.__tcg!.getState().session!.game;
        return g.seats.findIndex((s) => s.id === g.turn.activeSeat);
      });
      const responder = (active + 1) % n;
      await page.getByTestId(`seat-${responder}-respond`).click();
      await page.clock.runFor(12_000);
      if (n > 2) {
        await page.getByTestId(`seat-${(active + 2) % n}-respond`).click();
        await page.clock.runFor(3_000);
      }
      await page.screenshot({ path: `artifacts/screens/timer-${n}p-respond-${vp.w}x${vp.h}.png` });
      await page.evaluate(() => window.__tcg!.dispatch({ type: "TIMER_RETURN_TO_ACTIVE" }));
      await page.clock.runFor(1_000);
      await page.screenshot({ path: `artifacts/screens/timer-${n}p-${vp.w}x${vp.h}.png` });
    }
  }
});
