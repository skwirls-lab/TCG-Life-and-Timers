// @req TOOL-001 @req TOOL-002 @req TOOL-003 @req TOOL-008 @req TOOL-009 @req TOOL-010 @req TOOL-011 @req HIST-012 @req A11Y-002
import { expect, test, type Page } from "@playwright/test";
import { expectNoSeriousA11yViolations } from "./support/axe";

const QUICK = "quick=mtg.commander&players=4&seed=7&names=Conner,Josh,JP,Bethany";

async function logKinds(page: Page): Promise<string[]> {
  return page.evaluate(() => window.__tcg!.getState().session!.game.log.map((e) => e.kind));
}

async function seatId(page: Page, name: string): Promise<string> {
  return page.evaluate(
    (n) => window.__tcg!.getState().session!.game.seats.find((s) => s.name === n)!.id,
    name,
  );
}

async function resultValue(page: Page): Promise<string> {
  const overlay = page.getByTestId("tool-result");
  await expect(overlay).toBeVisible();
  await expect(overlay).toHaveAttribute("data-settled", "true");
  return (await page.getByTestId("tool-result-value").textContent())!.trim();
}

test("d20 shows the result overlay (1–20) and logs a LOG_NOTE to the active game", async ({
  page,
}) => {
  await page.goto(`/tools?${QUICK}`);
  await expect(page.getByTestId("tools-page")).toBeVisible();
  await expect.poll(() => page.evaluate(() => !!window.__tcg?.getState().session)).toBe(true);
  await page.getByTestId("tool-d20").click();
  const v = Number(await resultValue(page));
  expect(v).toBeGreaterThanOrEqual(1);
  expect(v).toBeLessThanOrEqual(20);
  expect(await logKinds(page)).toContain("dice");
  const meta = await page.evaluate(
    () => window.__tcg!.getState().session!.game.log.find((e) => e.kind === "dice")!.meta,
  );
  expect(meta).toMatchObject({ sides: 20, count: 1, total: v });
  await expectNoSeriousA11yViolations(page);
  // Roll again logs another roll; tap anywhere dismisses.
  await page.getByTestId("tool-result-again").click();
  await expect.poll(async () => (await logKinds(page)).filter((k) => k === "dice").length).toBe(2);
  await page.getByTestId("tool-result-dismiss").click({ position: { x: 10, y: 10 } });
  await expect(page.getByTestId("tool-result")).toBeHidden();
});

test("custom die N=7 rolls 1..7 and remembers N", async ({ page }) => {
  await page.goto("/tools");
  await page.getByTestId("tool-custom-set").click();
  await page.getByTestId("custom-n-input").fill("7");
  await page.getByTestId("custom-n-roll").click();
  const v = Number(await resultValue(page));
  expect(v).toBeGreaterThanOrEqual(1);
  expect(v).toBeLessThanOrEqual(7);
  await expect(page.getByTestId("tool-result")).toContainText("d7");
  await expect(page.getByTestId("tools-root")).toHaveAttribute("data-kv-saved", "true");
  await page.reload();
  await expect(page.getByTestId("tool-custom")).toHaveAccessibleName("Custom d7");
});

test("multi dice show each die and the sum; coin flips heads or tails", async ({ page }) => {
  await page.goto("/tools");
  const plus = page.getByRole("button", { name: "Number of dice and coins +" });
  await plus.click();
  await plus.click();
  await expect(page.getByTestId("tool-count-value")).toHaveText("×3");
  await page.getByTestId("tool-d6").click();
  await expect(page.getByTestId("tool-result-die")).toHaveCount(3);
  const values = await page
    .getByTestId("tool-result-die")
    .evaluateAll((els) => els.map((e) => Number(e.getAttribute("data-value"))));
  expect(values.every((x) => x >= 1 && x <= 6)).toBe(true);
  const sum = values.reduce((a, b) => a + b, 0);
  await expect(page.getByTestId("tool-result-total")).toHaveText(`Sum ${sum}`);
  await page.keyboard.press("Escape");
  await expect(page.getByTestId("tool-result")).toBeHidden();

  const minus = page.getByRole("button", { name: "Number of dice and coins −" });
  await minus.click();
  await minus.click();
  await page.getByTestId("tool-coin").click();
  expect(["Heads", "Tails"]).toContain(await resultValue(page));
});

test("randomize opponent with ?from never returns the chooser", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto(`/tools?${QUICK}`);
  await expect.poll(() => page.evaluate(() => !!window.__tcg?.getState().session)).toBe(true);
  const jp = await seatId(page, "JP");
  await page.goto(`/tools?${QUICK}&from=${jp}`);
  await expect.poll(() => page.evaluate(() => !!window.__tcg?.getState().session)).toBe(true);
  expect(await seatId(page, "JP")).toBe(jp);
  await expect(page.getByTestId("tools-root")).toHaveAttribute("data-chooser", jp);
  await page.getByTestId("tool-random-opponent").click();
  await expect(page.getByTestId("seat-picker")).toHaveCount(0);
  for (let i = 0; i < 15; i++) {
    if (i > 0) await page.getByTestId("tool-result-again").click();
    await expect(page.getByTestId("tool-result")).toContainText("JP's random opponent");
    const picked = await page.getByTestId("tool-result-value").getAttribute("data-seat-id");
    expect(picked).toBeTruthy();
    expect(picked).not.toBe(jp);
  }
  const kinds = await logKinds(page);
  expect(kinds.filter((k) => k === "random")).toHaveLength(15);
});

test("randomize opponent without ?from asks who is choosing", async ({ page }) => {
  await page.goto(`/tools?${QUICK}`);
  await expect.poll(() => page.evaluate(() => !!window.__tcg?.getState().session)).toBe(true);
  await page.getByTestId("tool-random-opponent").click();
  const picker = page.getByTestId("seat-picker");
  await expect(picker).toBeVisible();
  await picker.getByRole("button", { name: "Josh" }).click();
  await expect(page.getByTestId("tool-result")).toContainText("Josh's random opponent");
  await expect(page.getByTestId("tool-result")).toHaveAttribute("data-settled", "true");
  await expect(page.getByTestId("tool-result-value")).not.toHaveText("Josh");
});

test("mana page +/− and clear persist across reload", async ({ page }) => {
  await page.goto("/tools");
  await page.getByTestId("tools-mana-link").click();
  await expect(page).toHaveURL(/\/tools\/mana$/);
  const root = page.getByTestId("mana-root");
  await expect(root).toHaveAttribute("data-loaded", "true");
  await expect(root).toHaveAttribute("data-storm-source", "device");
  for (let i = 0; i < 3; i++) await page.getByTestId("mana-W-plus").click();
  await page.getByTestId("mana-G-plus").click();
  await page.getByTestId("mana-G-plus").click();
  await page.getByTestId("mana-G-minus").click();
  await page.getByTestId("mana-storm-plus").click();
  await page.getByTestId("mana-storm-plus").click();
  await expect(page.getByTestId("mana-W-value")).toHaveText("3");
  await expect(page.getByTestId("mana-G-value")).toHaveText("1");
  await expect(root).toHaveAttribute("data-saved", "true");
  await expectNoSeriousA11yViolations(page);

  await page.reload();
  await expect(root).toHaveAttribute("data-loaded", "true");
  await expect(page.getByTestId("mana-W-value")).toHaveText("3");
  await expect(page.getByTestId("mana-G-value")).toHaveText("1");
  await expect(page.getByTestId("mana-storm-value")).toHaveText("2");
  await expect(page.getByTestId("mana-U-minus")).toBeDisabled();

  await page.getByTestId("mana-clear").click();
  await expect(page.getByTestId("mana-W-value")).toHaveText("0");
  await expect(root).toHaveAttribute("data-saved", "true");
  await page.reload();
  await expect(root).toHaveAttribute("data-loaded", "true");
  for (const f of ["W", "U", "B", "R", "G", "C", "storm"]) {
    await expect(page.getByTestId(`mana-${f}-value`)).toHaveText("0");
  }
});

test("mana storm edits the game's storm counter when the preset has one", async ({ page }) => {
  await page.goto(`/tools/mana?${QUICK}`);
  const root = page.getByTestId("mana-root");
  await expect(root).toHaveAttribute("data-storm-source", "game");
  await page.getByTestId("mana-storm-plus").click();
  await page.getByTestId("mana-storm-plus").click();
  await expect(page.getByTestId("mana-storm-value")).toHaveText("2");
  const storm = await page.evaluate(() => window.__tcg!.getState().session!.game.values);
  expect(Object.entries(storm).find(([k]) => k.startsWith("mtg.storm|"))?.[1]).toBe(2);
});

test("tools page is accessible", async ({ page }) => {
  await page.goto(`/tools?${QUICK}`);
  await expect(page.getByTestId("tools-tip")).toContainText("Hold the die button");
  await expectNoSeriousA11yViolations(page);
});
