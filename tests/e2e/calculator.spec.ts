// @req INP-007 @req TOOL-006 @req A11Y-002
/** Appendix B Scenario 9: LP 8000 → −2300 → 5700 → /2 → 2850 → the tape shows the arithmetic. */
import { expect, test, type Page } from "@playwright/test";
import { expectNoSeriousA11yViolations } from "./support/axe";

async function press(page: Page, keys: string[]) {
  const pad = page.getByTestId("calc-keypad");
  for (const k of keys) await pad.getByRole("button", { name: k, exact: true }).click();
  await page.getByTestId("calc-keypad-submit").click();
}

test("Scenario 9: Yu-Gi-Oh! calculator with tape", async ({ page }) => {
  await page.goto("/dev/presets?quick=ygo.advanced&players=2&seed=5&names=Yugi,Kaiba");
  await expect(page.getByTestId("presets-harness")).toBeVisible();
  await page.getByTestId("harness-calc-0").click();
  const sheet = page.getByTestId("calc-sheet");
  await expect(sheet).toBeVisible();
  await expect(page.getByTestId("calc-value")).toHaveText("8000");
  await expect(page.getByTestId("calc-tape-empty")).toBeVisible();

  await press(page, ["−", "2", "3", "0", "0"]);
  await expect(page.getByTestId("calc-value")).toHaveText("5700");
  await expect(page.getByTestId("calc-keypad-display")).toHaveText("0");
  await press(page, ["½"]);
  await expect(page.getByTestId("calc-value")).toHaveText("2850");
  await expect(page.getByTestId("calc-tape-row")).toHaveText([
    "8000 − 2300 = 5700",
    "5700 ÷ 2 = 2850",
  ]);
  await expectNoSeriousA11yViolations(page);

  // = sets, + adds; the seat value and history follow.
  await press(page, ["=", "4", "0", "0", "0"]);
  await press(page, ["+", "8", "00"]);
  await expect(page.getByTestId("calc-value")).toHaveText("4800");
  await expect(page.getByTestId("calc-tape-row").nth(3)).toHaveText("4000 + 800 = 4800");
  await page.getByTestId("calc-sheet-close").click();
  await expect(sheet).toBeHidden();
  await expect(page.getByTestId("harness-value-0-ygo.lp")).toHaveText("4800");
  const entries = await page.evaluate(
    () =>
      window
        .__tcg!.getState()
        .session!.game.log.filter((e) => e.kind === "counter")
        .map((e) => [e.from, e.to]) as [number, number][],
  );
  expect(entries).toEqual([
    [8000, 5700],
    [5700, 2850],
    [2850, 4000],
    [4000, 4800],
  ]);
});

test("calculator never goes below 0 and ends the duel; rotated sheet faces the seat", async ({
  page,
}) => {
  await page.goto("/dev/presets?quick=ygo.speed&players=2&seed=5&rot=180");
  await expect(page.getByTestId("presets-harness")).toBeVisible();
  await page.getByTestId("harness-calc-1").click();
  await expect(page.getByTestId("calc-value")).toHaveText("4000");
  const transform = await page
    .getByRole("dialog")
    .evaluate((el) => (el as HTMLElement).style.transform);
  expect(transform).toBe("rotate(180deg)");
  await press(page, ["9", "9", "9", "9"]);
  await expect(page.getByTestId("calc-value")).toHaveText("0");
  await expect(page.getByTestId("calc-tape-row")).toHaveText(["4000 − 9999 = 0"]);
  await page.keyboard.press("Escape");
  await expect(page.getByTestId("harness-status")).toHaveText("ended");
  await expect(page.getByTestId("harness-winner")).toHaveText("0");
});
