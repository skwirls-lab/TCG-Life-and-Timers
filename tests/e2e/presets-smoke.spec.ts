// @req PRE-010 @req PRE-011 @req CUS-008
/** One smoke per visible built-in preset: start → primary to its threshold → win/lose detected. */
import { expect, test, type Page } from "@playwright/test";
import { listBuiltInPresets } from "../../src/presets";

async function open(page: Page, presetId: string) {
  await page.goto(`/dev/presets?quick=${presetId}&players=2&seed=5&names=Ann,Bob`);
  await expect(page.getByTestId("presets-harness")).toBeVisible();
  await expect(page.getByTestId("harness-status")).toHaveText("ready");
}

for (const preset of listBuiltInPresets()) {
  const primary = preset.counters.find((c) => c.isPrimary)!;
  const rule = primary.threshold!;
  test(`${preset.id}: ${primary.name} ${rule.comparator} ${rule.value} → ${rule.outcome}`, async ({
    page,
  }) => {
    await open(page, preset.id);
    await page.getByTestId("harness-start").click();
    await expect(page.getByTestId("harness-status")).toHaveText("running");
    const row = `0-${primary.id}`;
    await expect(page.getByTestId(`harness-value-${row}`)).toHaveText(String(primary.start));
    // One step toward the threshold by tapping, then set exactly to it.
    await page.getByTestId(`harness-${primary.direction === "up" ? "inc" : "dec"}-${row}`).click();
    await expect(page.getByTestId("harness-status")).toHaveText("running");
    await page.getByTestId("harness-amount").fill(String(rule.value));
    await page.getByTestId(`harness-set-${row}`).click();
    await expect(page.getByTestId(`harness-value-${row}`)).toHaveText(String(rule.value));
    await expect(page.getByTestId("harness-status")).toHaveText("ended");
    await expect(page.getByTestId("harness-winner")).toHaveText(rule.outcome === "win" ? "0" : "1");
    if (rule.outcome === "lose")
      await expect(page.getByTestId("harness-seat-0")).toHaveAttribute("data-eliminated", "true");
  });
}

test("Pokémon per-turn flags clear when the turn passes (CUS-008)", async ({ page }) => {
  await open(page, "pokemon.standard");
  await page.getByTestId("harness-start").click();
  const first = await page.evaluate(() => {
    const g = window.__tcg!.getState().session!.game;
    return g.seats.findIndex((s) => s.id === g.turn.activeSeat);
  });
  await page.getByTestId(`harness-inc-${first}-pkm.supporter`).click();
  await page.getByTestId(`harness-inc-${first}-pkm.vstar`).click();
  await expect(page.getByTestId(`harness-value-${first}-pkm.supporter`)).toHaveText("1");
  await page.getByTestId("harness-pass").click();
  await expect(page.getByTestId(`harness-value-${first}-pkm.supporter`)).toHaveText("0");
  await expect(page.getByTestId(`harness-value-${first}-pkm.vstar`)).toHaveText("1");
});

test("Digimon memory gauge is one global counter clamped to ±10", async ({ page }) => {
  await open(page, "digimon.standard");
  await page.getByTestId("harness-amount").fill("15");
  await page.getByTestId("harness-set-g-digimon.memory").click();
  await expect(page.getByTestId("harness-value-g-digimon.memory")).toHaveText("10");
  await page.getByTestId("harness-amount").fill("-15");
  await page.getByTestId("harness-set-g-digimon.memory").click();
  await expect(page.getByTestId("harness-value-g-digimon.memory")).toHaveText("-10");
});

test("Sorcery: 0 life is Death's Door; the next damage loses", async ({ page }) => {
  await open(page, "sorcery.standard");
  await page.getByTestId("harness-amount").fill("0");
  await page.getByTestId("harness-set-0-sorcery.life").click();
  await page.getByTestId("harness-inc-0-sorcery.deathsDoor").click();
  await expect(page.getByTestId("harness-status")).not.toHaveText("ended");
  await page.getByTestId("harness-dec-0-sorcery.life").click();
  await expect(page.getByTestId("harness-status")).toHaveText("ended");
  await expect(page.getByTestId("harness-winner")).toHaveText("1");
});
