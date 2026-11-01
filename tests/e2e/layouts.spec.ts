// @req LAY-001 @req LAY-002 @req LAY-006 @req LAY-010 @req A11Y-002
import { expect, test } from "@playwright/test";
import { getLayout } from "../../src/engine/layout";
import { expectNoSeriousA11yViolations } from "./support/axe";

const NAMES = "Conner,Josh,JP,Bethany,Declan,Maya";
const url = (n: number) =>
  `/play?quick=mtg.commander&players=${n}&seed=3&names=${NAMES}&s.hideSystemBars=0`;

for (const vp of [
  { width: 360, height: 740 },
  { width: 740, height: 360 },
]) {
  test(`2–6 players fit the ${vp.width}×${vp.height} viewport with the right rotations`, async ({
    page,
  }) => {
    await page.setViewportSize(vp);
    for (let n = 2; n <= 6; n++) {
      await page.goto(url(n));
      await expect(page.getByTestId(`seat-${n - 1}`)).toBeVisible();
      const expected = getLayout({ players: n, viewport: { w: vp.width, h: vp.height } });
      const boxes = [];
      for (let i = 0; i < n; i++) {
        const tile = page.getByTestId(`seat-${i}`);
        await expect(tile).toHaveAttribute("data-rotation", String(expected.seats[i]!.rotation));
        const b = (await tile.boundingBox())!;
        expect(b.x).toBeGreaterThanOrEqual(-0.5);
        expect(b.y).toBeGreaterThanOrEqual(-0.5);
        expect(b.x + b.width).toBeLessThanOrEqual(vp.width + 0.5);
        expect(b.y + b.height).toBeLessThanOrEqual(vp.height + 0.5);
        // Every seat's number and name pill are inside its own tile.
        for (const part of ["value", "name"]) {
          const p = (await page.getByTestId(`seat-${i}-${part}`).boundingBox())!;
          expect(p.x).toBeGreaterThanOrEqual(b.x - 0.5);
          expect(p.y).toBeGreaterThanOrEqual(b.y - 0.5);
          expect(p.x + p.width).toBeLessThanOrEqual(b.x + b.width + 0.5);
          expect(p.y + p.height).toBeLessThanOrEqual(b.y + b.height + 0.5);
        }
        boxes.push(b);
      }
      const bar = (await page.getByTestId("toolbar").boundingBox())!;
      boxes.push(bar);
      for (let i = 0; i < boxes.length; i++)
        for (let j = i + 1; j < boxes.length; j++) {
          const a = boxes[i]!;
          const c = boxes[j]!;
          const ow = Math.min(a.x + a.width, c.x + c.width) - Math.max(a.x, c.x);
          const oh = Math.min(a.y + a.height, c.y + c.height) - Math.max(a.y, c.y);
          expect(ow > 0.5 && oh > 0.5, `seat boxes ${i} and ${j} overlap`).toBe(false);
        }
    }
  });
}

for (const n of [2, 4]) {
  test(`/play with ${n} players has no serious a11y violations`, async ({ page }) => {
    await page.goto(url(n));
    await expect(page.getByTestId("seat-0-value")).toBeVisible();
    await expectNoSeriousA11yViolations(page);
  });
}
