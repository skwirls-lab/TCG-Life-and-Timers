// Seat art picker: Scryfall search → prints → focal editor (T5.2). Scryfall is intercepted.
// @req ART-001 @req ART-002 @req ART-003 @req ART-004 @req ART-005 @req ART-008 @req ART-009
// @req PROF-010
import { expect, test, type Page } from "@playwright/test";
import { expectNoSeriousA11yViolations } from "./support/axe";
import { routeScryfall } from "./support/artRoutes";
import { gotoHarness, openSeatMenu } from "./support/seatHarness";

const SOL_C13 =
  "https://cards.scryfall.io/art_crop/front/f/e/fe368d57-c70a-41b1-ab69-629ffa91da67.jpg?1700000000";
const SOL_LEA =
  "https://cards.scryfall.io/art_crop/front/7/b/7b4f521b-4cae-480f-bc91-33700b14fad8.jpg?1700000000";
const DELVER_BACK =
  "https://cards.scryfall.io/art_crop/back/3/e/3ee74b3f-1e4f-42ed-ae71-c0f2f6e4d908.jpg?1700000000";

type SeatArt = {
  kind: string;
  value: string;
  artist?: string;
  cardName?: string;
  focal?: { x: number; y: number; zoom: number };
};

function seatArt(page: Page, i: number): Promise<SeatArt | undefined> {
  return page.evaluate(
    (idx) => window.__tcg?.getState().session?.game.seats[idx]?.art as SeatArt | undefined,
    i,
  );
}

async function searchAndOpen(page: Page, typed: string, suggestion: RegExp | string) {
  await page.getByTestId("art-search-open").click();
  await page.getByTestId("art-search-input").pressSequentially(typed, { delay: 40 });
  await page.getByTestId("art-suggestions").getByRole("button", { name: suggestion }).click();
  await expect(page.getByTestId("art-prints-grid")).toBeVisible();
}

/** Drag on the focal frame by (dx, dy) screen pixels with the mouse. */
async function dragFrame(page: Page, dx: number, dy: number) {
  const frame = page.getByTestId("art-focal-frame");
  await frame.scrollIntoViewIfNeeded();
  const box = (await frame.boundingBox())!;
  const x = box.x + box.width / 2;
  const y = box.y + box.height / 2;
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.mouse.move(x + dx / 2, y + dy / 2, { steps: 3 });
  await page.mouse.move(x + dx, y + dy, { steps: 3 });
  await page.mouse.up();
}

test.describe("art picker", () => {
  // @req ART-001 @req ART-002 @req ART-004 @req ART-005
  test("search → choose a print → position and zoom → saved with artist credit", async ({
    page,
    context,
  }) => {
    const log = await routeScryfall(context);
    await gotoHarness(page);
    await openSeatMenu(page, 0);
    await expect(page.getByTestId("art-picker")).toBeVisible();
    await expectNoSeriousA11yViolations(page);

    await page.getByTestId("art-search-open").click();
    const input = page.getByTestId("art-search-input");
    await input.pressSequentially("S", { delay: 30 });
    await expect(page.getByTestId("art-search")).toContainText("2 letters");
    await input.pressSequentially("ol", { delay: 40 });
    await expect(page.getByTestId("art-suggestion-0")).toHaveText("Sol Ring");
    // debounced: one autocomplete call for the whole word (ART-001)
    expect(log.api.filter((u) => u.startsWith("/cards/autocomplete"))).toEqual([
      "/cards/autocomplete?q=Sol",
    ]);
    await expectNoSeriousA11yViolations(page);
    await page.getByTestId("art-suggestion-0").click();

    // every artwork across result pages, with set and artist (ART-002)
    const prints = page.getByTestId("art-prints-grid").locator("li");
    await expect(prints).toHaveCount(3);
    await expect(page.getByTestId("art-print-1")).toContainText("Commander 2013");
    await expect(page.getByTestId("art-print-1")).toContainText("Art: Mike Bierek");
    await expect(page.getByTestId("art-print-2")).toContainText("Limited Edition Alpha");
    await page.getByTestId("art-print-1").click();

    // focal editor (ART-004)
    const frame = page.getByTestId("art-focal-frame");
    await expect(frame).toBeVisible();
    await expect(page.getByTestId("art-focal-credit")).toHaveText("Art: Mike Bierek");
    await expect(frame).toHaveAttribute("data-focal", "0.500,0.500,1.000");
    await page.getByTestId("art-zoom").fill("2");
    await expect(frame).toHaveAttribute("data-focal", /,2\.000$/);
    await dragFrame(page, 40, 20);
    const after = (await frame.getAttribute("data-focal"))!.split(",").map(Number);
    expect(after[0]).toBeLessThan(0.5); // dragged right → image moves right → focal x decreases
    expect(after[1]).toBeLessThan(0.5);
    await expectNoSeriousA11yViolations(page);
    await page.getByTestId("art-focal-save").click();

    const seat = page.getByTestId("harness-seat-0");
    await expect(seat).toHaveAttribute("data-art-kind", "scryfall");
    await expect(seat).toHaveAttribute("data-art-value", SOL_C13);
    const art = await seatArt(page, 0);
    expect(art).toMatchObject({ artist: "Mike Bierek", cardName: "Sol Ring" });
    expect(art?.focal?.zoom).toBe(2);
    expect(art?.focal?.x).toBeCloseTo(after[0]!, 3);

    // commander preset: offer "Use as commander" (PROF-010)
    await expect(page.getByTestId("art-saved")).toBeVisible();
    await page.getByTestId("art-use-commander").click();
    await expect(seat).toHaveAttribute("data-commanders", "Sol Ring");
    await page.getByTestId("art-done").click();
    await expect(page.getByTestId("art-credit")).toHaveText("Art: Mike Bierek"); // ART-005
    await expect(page.getByTestId("art-current-preview")).toHaveAttribute(
      "data-art-kind",
      "scryfall",
    );
  });

  // @req ART-003
  test("double-faced card: choose the back face", async ({ page, context }) => {
    await routeScryfall(context);
    await gotoHarness(page);
    await openSeatMenu(page, 1);
    await searchAndOpen(page, "Delver", /Delver of Secrets/);
    await expect(page.getByTestId("art-print-0")).toContainText("Face: Delver of Secrets");
    await expect(page.getByTestId("art-print-1")).toContainText("Face: Insectile Aberration");
    await page.getByTestId("art-print-1").click();
    await page.getByTestId("art-focal-save").click();
    await expect(page.getByTestId("harness-seat-1")).toHaveAttribute("data-art-value", DELVER_BACK);
    expect(await seatArt(page, 1)).toMatchObject({
      kind: "scryfall",
      cardName: "Insectile Aberration",
      artist: "Matt Stewart",
    });
  });

  // @req ART-004
  test("drags are un-rotated when the seat menu faces the opposite seat", async ({
    page,
    context,
  }) => {
    await routeScryfall(context);
    await gotoHarness(page, "&rot=180");
    await openSeatMenu(page, 0);
    await searchAndOpen(page, "Sol", "Sol Ring");
    await page.getByTestId("art-print-0").click();
    await page.getByTestId("art-zoom").fill("2");
    await dragFrame(page, 40, 0); // screen right = the player's left
    const f = (await page.getByTestId("art-focal-frame").getAttribute("data-focal"))!
      .split(",")
      .map(Number);
    expect(f[0]).toBeGreaterThan(0.5);
    expect(f[1]).toBeCloseTo(0.5, 2);
  });

  // @req ART-009
  test("offline: search shows the offline message", async ({ page, context }) => {
    await routeScryfall(context);
    await gotoHarness(page);
    await openSeatMenu(page, 0);
    await context.setOffline(true);
    await page.getByTestId("art-search-open").click();
    await expect(page.getByTestId("art-offline")).toHaveText("Offline — search unavailable");
    await page.getByTestId("art-search-input").fill("Sol");
    await expect(page.getByTestId("art-suggestion-0")).toHaveCount(0);
    await context.setOffline(false);
    await expect(page.getByTestId("art-offline")).toHaveCount(0);
    await expect(page.getByTestId("art-suggestion-0")).toHaveText("Sol Ring");
  });

  // @req ART-008 @req PROF-010
  test("commander auto-art in one tap, and save the card to the seat's deck", async ({
    page,
    context,
  }) => {
    await routeScryfall(context);
    await gotoHarness(page);
    await openSeatMenu(page, 2);
    // a profile for the seat (no deck yet)
    await page.getByTestId("seat-save-profile").click();
    const seat = page.getByTestId("harness-seat-2");
    await expect(seat).not.toHaveAttribute("data-profile", "");

    await page.getByTestId("seat-commander-0").fill("Sol Ring");
    await page.getByTestId("seat-commander-0").blur();
    await expect(seat).toHaveAttribute("data-commanders", "Sol Ring");
    await page.getByTestId("art-commander-art").click();
    await expect(seat).toHaveAttribute("data-art-value", SOL_LEA);
    expect(await seatArt(page, 2)).toMatchObject({ artist: "Mark Tedin", cardName: "Sol Ring" });

    // choose another print and save it to the deck (PROF-010)
    await searchAndOpen(page, "Sol", "Sol Ring");
    await page.getByTestId("art-print-1").click();
    await page.getByTestId("art-focal-save").click();
    await page.getByTestId("art-save-deck").click();
    await expect(seat).toHaveAttribute("data-deck", "Sol Ring");
    await expect(page.getByTestId("art-notice")).toContainText("Saved Sol Ring to deck");
  });
});
