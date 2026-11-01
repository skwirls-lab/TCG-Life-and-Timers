// @req PROF-001 @req PROF-002 @req PROF-010 @req PROF-011 @req A11Y-002
import { expect, test } from "@playwright/test";
import { expectNoSeriousA11yViolations } from "./support/axe";
import { gotoHarness, openSeatMenu } from "./support/seatHarness";

test.describe("profiles and decks", () => {
  // @req PROF-001 @req PROF-002 @req PROF-010
  test("create profile + deck on /profiles, then load it into a seat", async ({ page }) => {
    await page.goto("/profiles");
    await expect(page.getByTestId("profiles-page")).toBeVisible();
    await expect(page.getByTestId("profiles-empty")).toBeVisible();
    await expectNoSeriousA11yViolations(page);

    await page.getByTestId("profile-new").click();
    await page.getByTestId("profile-name-input").fill("Jean-Paul");
    await page.getByTestId("profile-color-3").click();
    await page.getByTestId("profile-save").click();
    await expect(page.getByTestId("deck-new")).toBeVisible();
    await expectNoSeriousA11yViolations(page);

    await page.getByTestId("deck-new").click();
    await page.getByTestId("deck-name-input").fill("Toxrill");
    await page.getByTestId("deck-preset").selectOption("mtg.commander");
    await page.getByTestId("deck-commander-0").fill("Toxrill, the Corrosive");
    await expectNoSeriousA11yViolations(page);
    await page.getByTestId("deck-save").click();
    await expect(page.getByTestId("deck-row-0")).toContainText("Toxrill");

    await page.getByTestId("page-back").click();
    await expect(page.getByTestId("profile-row-0")).toContainText("Jean-Paul");
    await expect(page.getByTestId("profile-row-0")).toContainText("1 deck");

    await gotoHarness(page);
    await openSeatMenu(page, 2);
    await page.getByTestId("seat-load-profile").click();
    await page.getByTestId("profile-option-0").click();
    await page.getByTestId("deck-option-0").click();
    const seat = page.getByTestId("harness-seat-2");
    await expect(seat).toHaveAttribute("data-name", "Jean-Paul");
    await expect(seat).toHaveAttribute("data-color", "#34d399");
    await expect(seat).toHaveAttribute("data-commanders", "Toxrill, the Corrosive");
    await expect(seat).toHaveAttribute("data-deck", "Toxrill");
    await expect(seat).not.toHaveAttribute("data-profile", "");
    await expect(page.getByTestId("seat-name-input")).toHaveValue("Jean-Paul");
    await expect(page.getByTestId("seat-commander-0")).toHaveValue("Toxrill, the Corrosive");
  });

  test("load a profile with a new deck from the picker", async ({ page }) => {
    await page.goto("/profiles");
    await page.getByTestId("profile-new").click();
    await page.getByTestId("profile-name-input").fill("Bethany");
    await page.getByTestId("profile-save").click();
    await expect(page.getByTestId("deck-new")).toBeVisible();

    await gotoHarness(page);
    await openSeatMenu(page, 3);
    await page.getByTestId("seat-load-profile").click();
    await page.getByTestId("profile-option-0").click();
    await page.getByTestId("deck-option-new").click();
    await page.getByTestId("deck-new-name").fill("Elves");
    await page.getByTestId("deck-new-create").click();
    await expect(page.getByTestId("harness-seat-3")).toHaveAttribute("data-deck", "Elves");
    await expect(page.getByTestId("seat-deck-name")).toContainText("Elves");
  });

  // @req PROF-011 @req PROF-001
  test("a name-only player used in 2 games is offered 'Save as a profile'", async ({ page }) => {
    await gotoHarness(page);
    await openSeatMenu(page, 1);
    await page.getByTestId("seat-name-input").fill("Declan");
    await page.getByTestId("seat-name-input").press("Enter");
    await expect(page.getByTestId("seat-profile-suggest")).toBeHidden();
    // The use is recorded in IndexedDB asynchronously: wait for it before leaving the page.
    await expect
      .poll(() =>
        page.evaluate(
          () =>
            new Promise<number>((resolve) => {
              const req = indexedDB.open("tcg-life");
              req.onsuccess = () => {
                const get = req.result.transaction("kv").objectStore("kv").get("nameUse:declan");
                get.onsuccess = () => {
                  resolve(Array.isArray(get.result?.value) ? get.result.value.length : 0);
                  req.result.close();
                };
              };
            }),
        ),
      )
      .toBe(1);

    // A second game (different seed → different game id).
    await page.goto("/dev/seat-menu?quick=mtg.commander&players=4&seed=8");
    await expect(page.getByTestId("seat-harness")).toBeVisible();
    await openSeatMenu(page, 1);
    await page.getByTestId("seat-name-input").fill("Declan");
    await page.getByTestId("seat-name-input").press("Enter");
    const suggest = page.getByTestId("seat-profile-suggest");
    await expect(suggest).toContainText("Save Declan as a profile?");
    await suggest.getByRole("button", { name: "Save" }).click();
    await expect(suggest).toBeHidden();
    await expect(page.getByTestId("harness-seat-1")).not.toHaveAttribute("data-profile", "");

    await page.goto("/profiles");
    await expect(page.getByTestId("profile-row-0")).toContainText("Declan");
  });
});
