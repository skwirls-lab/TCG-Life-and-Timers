// @req LAY-002 @req LAY-006 @req LAY-007 (G-VISUAL captures; not assertions)
import { mkdirSync } from "node:fs";
import { expect, test } from "@playwright/test";

const NAMES = "Conner,Josh,JP,Bethany,Declan,Maya,Ravi,Lena";
const VIEWPORTS = [
  { w: 360, h: 740 },
  { w: 915, h: 412 },
];

test("capture /play for 2–6 players (portrait + landscape)", async ({ page }, info) => {
  // One project is enough for the captures.
  if (info.project.name !== "pixel7") return;
  test.setTimeout(120_000);
  mkdirSync("artifacts/screens", { recursive: true });
  for (const vp of VIEWPORTS) {
    await page.setViewportSize({ width: vp.w, height: vp.h });
    for (let n = 2; n <= 6; n++) {
      await page.goto(
        `/play?quick=mtg.commander&players=${n}&seed=7&names=${NAMES}&s.hideSystemBars=0`,
      );
      await expect(page.getByTestId("seat-0")).toBeVisible();
      // Some state so badges / mini-grid / overlays show up.
      await page.evaluate(() => {
        const t = window.__tcg!;
        const seats = t.getState().session!.game.seats;
        t.dispatch({
          type: "COUNTER_ADD",
          counterId: "mtg.poison",
          seatId: seats[0]!.id,
          delta: 3,
        });
        t.dispatch({ type: "TOKEN_GIVE", counterId: "mtg.monarch", seatId: seats[1]!.id });
        t.dispatch({
          type: "CMD_DAMAGE_ADD",
          targetSeatId: seats[0]!.id,
          sourceSeatId: seats[1]!.id,
          sourceIndex: 0,
          delta: 7,
        });
        t.dispatch({ type: "CMD_TAX_CAST", seatId: seats[1]!.id, commanderIndex: 0, delta: 1 });
        if (seats.length > 2) t.dispatch({ type: "ELIMINATE", seatId: seats[2]!.id });
      });
      await page.screenshot({ path: `artifacts/screens/board-${n}p-${vp.w}x${vp.h}.png` });
    }
  }
});
