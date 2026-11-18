// @req A11Y-004 @req A11Y-001
/**
 * A11Y-004: colour is never the only signal — the active seat has ▶ + "Turn" text (and says so in
 * its accessible name), the responder has ⚡, low time has a warning icon, eliminated seats have
 * the skull with accessible text, lethal commander damage has an icon.
 */
import { expect, test } from "@playwright/test";
import { menuTap } from "./support/menu";
import { activeIndex, gotoClockBoard, timerState } from "./support/timer";

test("turn tracking without clocks: the active seat shows ▶ Turn text, not just a ring", async ({
  page,
}) => {
  await gotoClockBoard(page, "");
  await page.evaluate(() =>
    window.__tcg!.dispatch({ type: "SET_OPTION", key: "turnTracking", value: true }),
  );
  const a = await activeIndex(page);
  const chip = page.getByTestId(`seat-${a}-turn`);
  await expect(chip).toContainText("▶");
  await expect(chip).toContainText(/Turn \d/);
  await expect(page.getByTestId(`seat-${a}`)).toHaveAttribute("data-active", "true");
  await expect(page.getByTestId(`seat-${a}`)).toHaveAttribute("aria-label", /their turn/);
  const other = (a + 1) % 4;
  await expect(page.getByTestId(`seat-${other}-turn`)).toHaveCount(0);
  await expect(page.getByTestId(`seat-${other}`)).not.toHaveAttribute("aria-label", /their turn/);
});

test("clocks: holder ▶, responder ⚡, low time icon, skull + text when eliminated", async ({
  page,
}) => {
  await gotoClockBoard(page, "t.mode=bank&t.bankMs=15000&t.timeoutAction=grace&t.graceMs=60000");
  await menuTap(page, "timer-start");
  await expect.poll(async () => (await timerState(page)).status).toBe("running");
  const a = await activeIndex(page);
  const holder = page.getByTestId(`seat-${a}-clock`);
  await expect(holder).toContainText("▶");
  await expect(holder).toContainText(/Turn \d/);
  await expect(page.getByTestId(`seat-${a}-clock-low`)).toHaveCount(0);

  // Low time (< 10 s): a warning icon with a text alternative, not only red.
  await page.clock.runFor(6000);
  const low = page.getByTestId(`seat-${a}-clock-low`);
  await expect(low).toBeVisible();
  await expect(low).toHaveAttribute("aria-label", "Low time");
  // Overtime: caption text on top of the icon.
  await page.clock.runFor(10_000);
  await expect(holder).toContainText("Overtime");
  await expect(page.getByTestId("live-announcer")).toContainText("overtime");

  // Responder: ⚡ glyph + "Responding" caption.
  const r = (a + 1) % 4;
  await page.getByTestId(`seat-${r}-respond`).click();
  const resp = page.getByTestId(`seat-${r}-clock`);
  await expect(resp).toContainText("⚡");
  await expect(resp).toContainText("Responding");

  // Eliminated: skull with an accessible name, announced in the live region.
  const s = await timerState(page);
  const dead = (a + 2) % 4;
  await page.evaluate(
    (id) => window.__tcg!.dispatch({ type: "ELIMINATE", seatId: id }),
    s.seatIds[dead]!,
  );
  const overlay = page.getByTestId(`seat-${dead}-eliminated`);
  await expect(overlay.getByRole("img", { name: "Eliminated" })).toBeVisible();
  await expect(page.getByTestId("live-announcer")).toContainText("eliminated");
});

test("commander damage: lethal and near-lethal cells carry an icon", async ({ page }) => {
  await page.goto(
    "/play?quick=mtg.commander&players=4&seed=7&names=Conner,Josh,JP,Bethany&s.hideSystemBars=0",
  );
  await expect(page.getByTestId("seat-0-value")).toHaveText("40");
  const ids = await page.evaluate(() =>
    window.__tcg!.getState().session!.game.seats.map((s) => s.id),
  );
  await page.evaluate(
    ([target, src1, src2]) => {
      const d = window.__tcg!.dispatch;
      d({
        type: "CMD_DAMAGE_ADD",
        targetSeatId: target!,
        sourceSeatId: src1!,
        sourceIndex: 0,
        delta: 21,
      });
      d({
        type: "CMD_DAMAGE_ADD",
        targetSeatId: target!,
        sourceSeatId: src2!,
        sourceIndex: 0,
        delta: 18,
      });
    },
    [ids[0], ids[1], ids[2]],
  );
  await page.getByTestId("seat-0-name").click();
  await page.getByTestId("seat-menu-tab-commander").click();
  await expect(page.getByTestId("cmd-cell-1-0-lethal")).toHaveAttribute("aria-label", "Lethal");
  await expect(page.getByTestId("cmd-cell-2-0-warning")).toHaveAttribute(
    "aria-label",
    "Near lethal",
  );
  await expect(page.getByTestId("cmd-cell-3-0-warning")).toHaveCount(0);
});
