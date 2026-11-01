// @req PRE-010 @req CUS-008
/** Appendix B Scenario 10 (Pokémon): prizes 6 → take 6 → win; active damage +30 → reset clears. */
import { expect, test } from "@playwright/test";

test("Scenario 10: take six prizes to win; active damage steps by 10 and resets", async ({
  page,
}) => {
  await page.goto("/dev/presets?quick=pokemon.standard&players=2&seed=5&names=Ash,Misty");
  await expect(page.getByTestId("presets-harness")).toBeVisible();
  await page.getByTestId("harness-start").click();

  // Active damage on Misty: 3 taps at step 10 → 30, then "KO'd / reset" clears it.
  const dmg = "1-pkm.activeDamage";
  for (let i = 0; i < 3; i++) await page.getByTestId(`harness-inc-${dmg}`).click();
  await expect(page.getByTestId(`harness-value-${dmg}`)).toHaveText("30");
  await page.getByTestId(`harness-reset-${dmg}`).click();
  await expect(page.getByTestId(`harness-value-${dmg}`)).toHaveText("0");

  // Ash takes six prizes.
  const prizes = "0-pkm.prizes";
  await expect(page.getByTestId(`harness-value-${prizes}`)).toHaveText("6");
  for (let i = 0; i < 5; i++) await page.getByTestId(`harness-dec-${prizes}`).click();
  await expect(page.getByTestId(`harness-value-${prizes}`)).toHaveText("1");
  await expect(page.getByTestId("harness-status")).toHaveText("running");
  await page.getByTestId(`harness-dec-${prizes}`).click();
  await expect(page.getByTestId(`harness-value-${prizes}`)).toHaveText("0");
  await expect(page.getByTestId("harness-status")).toHaveText("ended");
  await expect(page.getByTestId("harness-winner")).toHaveText("0");
  const reason = await page.evaluate(() => window.__tcg!.getState().session!.game.result?.reason);
  expect(reason).toBe("winThreshold");
});
