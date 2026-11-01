// About / credits (T5.6).
// @req ART-005 @req LEG-002 @req LEG-003 @req TOOL-013
import { expect, test } from "@playwright/test";
import { expectNoSeriousA11yViolations } from "./support/axe";
import { routeScryfall } from "./support/artRoutes";
import { gotoHarness, openSeatMenu } from "./support/seatHarness";

test.describe("about and credits", () => {
  // @req ART-005 @req LEG-003 @req TOOL-013 @req LEG-002
  test("lists Scryfall, the artists of art in the game and saved profiles, icons, disclaimer", async ({
    page,
    context,
  }) => {
    await routeScryfall(context);
    // A saved profile whose background is Scryfall art (Mike Bierek's Sol Ring).
    await gotoHarness(page);
    await openSeatMenu(page, 0);
    await page.getByTestId("art-search-open").click();
    await page.getByTestId("art-search-input").pressSequentially("Sol", { delay: 40 });
    await page.getByTestId("art-suggestion-0").click();
    await page.getByTestId("art-print-1").click();
    await page.getByTestId("art-focal-save").click();
    await page.getByTestId("art-done").click();
    await page.getByTestId("seat-save-profile").click();
    await expect(page.getByTestId("harness-seat-0")).not.toHaveAttribute("data-profile", "");

    // The active game uses another artist's art (Matt Stewart's Delver).
    await page.goto("/about?quick=mtg.commander&players=2&seed=3");
    await expect(page.getByTestId("about-page")).toBeVisible();
    await page.evaluate(() => {
      const game = window.__tcg!.getState().session!.game;
      window.__tcg!.dispatch({
        type: "SEAT_SET_ART",
        seatId: game.seats[1]!.id,
        art: {
          kind: "scryfall",
          value: "https://cards.scryfall.io/art_crop/front/3/e/x.jpg",
          artist: "Matt Stewart",
          cardName: "Delver of Secrets",
        },
      });
    });

    await expect(page.getByTestId("about-version")).toHaveText(/^Version \d+\.\d+\.\d+/);
    await expect(page.getByTestId("about-scryfall")).toContainText("provided by Scryfall");
    await expect(page.getByTestId("about-scryfall-link")).toHaveAttribute(
      "href",
      "https://scryfall.com",
    );
    const artists = page.getByTestId("about-artists");
    await expect(artists.locator("li")).toHaveCount(2);
    await expect(page.getByTestId("about-artist-0")).toHaveAttribute("data-artist", "Matt Stewart");
    await expect(page.getByTestId("about-artist-0")).toContainText("Delver of Secrets");
    await expect(page.getByTestId("about-artist-1")).toHaveAttribute("data-artist", "Mike Bierek");
    await expect(page.getByTestId("about-artist-1")).toContainText("Sol Ring");
    await expect(page.getByTestId("about-icons")).toContainText("Lucide (ISC License)");
    await expect(page.getByTestId("about-icons")).toContainText("original drawings");
    await expect(page.getByTestId("about-disclaimer")).toContainText(
      "Not affiliated with, endorsed, sponsored, or approved by Wizards of the Coast",
    );
    await expect(page.getByTestId("about-draft")).toBeVisible();
    await expect(page.getByTestId("about-privacy")).toHaveAttribute("href", "/privacy");
    await expect(page.getByTestId("about-terms")).toHaveAttribute("href", "/terms");
    await expectNoSeriousA11yViolations(page);
  });

  test("no art in use: a friendly empty state", async ({ page }) => {
    await page.goto("/about");
    await expect(page.getByTestId("about-artists-none")).toBeVisible();
  });
});
