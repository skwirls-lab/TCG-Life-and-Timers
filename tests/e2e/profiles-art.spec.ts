// Profile / deck default backgrounds, Scryfall commanders and automatic commander backgrounds.
// Scryfall is answered from tests/fixtures/scryfall (the sandbox can't reach the live API).
// @req PROF-010 @req ART-008 @req PROF-002 @req A11Y-002
import { expect, test, type Page, type Route } from "@playwright/test";
import { routeScryfall } from "./support/artRoutes";
import { expectNoSeriousA11yViolations } from "./support/axe";

interface SeedProfile {
  id: string;
  name: string;
  color: string;
  art?: { kind: string; value: string };
  deck?: { id: string; name: string; commanders: string[] };
}

const COMMANDERS = [
  "Atraxa, Praetors' Voice",
  "Kenrith, the Returned King",
  "Edgar Markov",
  "Yuriko, the Tiger's Shadow",
];
const SOLID = { kind: "solid", value: "#7c3aed" };

/** Four players, each with a Commander deck (commanders, no deck art); two have profile art. */
const PLAYERS: SeedProfile[] = ["Ann", "Ben", "Cid", "Dee"].map((name, i) => ({
  id: `p-${name.toLowerCase()}`,
  name,
  color: ["#f472b6", "#60a5fa", "#facc15", "#34d399"][i]!,
  ...(i % 2 === 0 ? { art: SOLID } : {}),
  deck: { id: `d-${name.toLowerCase()}`, name: `${name}'s deck`, commanders: [COMMANDERS[i]!] },
}));

/** Write profiles/decks straight into the app's IndexedDB (the app must have opened it). */
async function seedProfiles(page: Page, profiles: SeedProfile[]) {
  // Let the app create its database (and stores) first.
  await expect
    .poll(() =>
      page.evaluate(async () => (await indexedDB.databases()).some((d) => d.name === "tcg-life")),
    )
    .toBe(true);
  await page.evaluate(async (rows) => {
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const req = indexedDB.open("tcg-life");
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(["profiles", "decks"], "readwrite");
      for (const p of rows) {
        tx.objectStore("profiles").put({
          id: p.id,
          name: p.name,
          normalizedName: p.name.toLowerCase(),
          color: p.color,
          contrast: false,
          ...(p.art ? { art: p.art } : {}),
          updatedAt: 1,
          schemaVersion: 1,
        });
        if (p.deck)
          tx.objectStore("decks").put({
            ...p.deck,
            profileId: p.id,
            presetId: "mtg.commander",
            updatedAt: 1,
            schemaVersion: 1,
          });
      }
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
    db.close();
  }, profiles);
}

/** The saved active game's "Set seat backgrounds to commanders" option. */
function storedCommanderArt(page: Page): Promise<boolean | undefined> {
  return page.evaluate(async () => {
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const req = indexedDB.open("tcg-life");
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
    const get = <T>(store: string, key: string) =>
      new Promise<T | undefined>((resolve) => {
        const r = db.transaction(store, "readonly").objectStore(store).get(key);
        r.onsuccess = () => resolve(r.result as T | undefined);
        r.onerror = () => resolve(undefined);
      });
    const ptr = await get<{ value?: string }>("kv", "activeGameId");
    const row = ptr?.value
      ? await get<{ game: { options: { commanderArt?: boolean } } }>("games", ptr.value)
      : undefined;
    db.close();
    return row?.game.options.commanderArt;
  });
}

type SeatArt = { kind: string; value: string; cardName?: string; origin?: string } | undefined;

function seatArts(page: Page): Promise<SeatArt[]> {
  return page.evaluate(
    () => window.__tcg?.getState().session?.game.seats.map((s) => s.art as SeatArt) ?? [],
  );
}

/** Setup → seats step: load each seat with its profile + deck, then go to the options step. */
async function setupWithProfiles(page: Page) {
  await page.goto("/setup");
  await expect(page.getByTestId("setup-step-preset")).toBeVisible();
  await seedProfiles(page, PLAYERS);
  await page.getByTestId("setup-next").click();
  await page.getByTestId("setup-next").click();
  await expect(page.getByTestId("setup-step-seats")).toBeVisible();
  for (const [i, p] of PLAYERS.entries()) {
    await page.getByTestId(`setup-seat-${i}-load`).click();
    await page
      .getByTestId("profile-picker")
      .getByRole("button", { name: p.name, exact: true })
      .click();
    await page.getByTestId("deck-option-0").click();
    await expect(page.getByTestId(`setup-seat-${i}-name`)).toHaveValue(p.name);
    await expect(page.getByTestId(`setup-seat-${i}-commander-0`)).toHaveValue(
      p.deck!.commanders[0]!,
    );
  }
  await page.getByTestId("setup-next").click();
  await expect(page.getByTestId("setup-step-options")).toBeVisible();
}

test.describe("profile and deck backgrounds", () => {
  // @req PROF-010 @req PROF-002 @req A11Y-002
  test("a profile's default background (Scryfall print + focal) shows on the seat it is loaded on", async ({
    page,
    context,
  }) => {
    await routeScryfall(context);
    await page.goto("/profiles");
    await page.getByTestId("profile-new").click();
    await page.getByTestId("profile-name-input").fill("Jean-Paul");
    await expect(page.getByTestId("profile-bg-caption")).toHaveText("No background");
    await page.getByTestId("profile-bg-change").click();
    await expect(page.getByTestId("profile-bg-sheet")).toBeVisible();
    await expectNoSeriousA11yViolations(page);
    await page.getByTestId("art-search-open").click();
    await page.getByTestId("art-search-input").pressSequentially("Sol", { delay: 30 });
    await page.getByTestId("art-suggestion-0").click();
    await page.getByTestId("art-print-1").click();
    await page.getByTestId("art-focal-save").click();
    await expect(page.getByTestId("art-current-preview")).toHaveAttribute(
      "data-art-kind",
      "scryfall",
    );
    await page.getByTestId("profile-bg-done").click();
    await expect(page.getByTestId("profile-bg-preview")).toHaveAttribute(
      "data-art-kind",
      "scryfall",
    );
    await expect(page.getByTestId("profile-bg-caption")).toHaveText("Sol Ring");
    await page.getByTestId("profile-save").click();
    await expect(page.getByTestId("deck-new")).toBeVisible();
    await page.getByTestId("page-back").click();
    await expect(page.getByTestId("profile-row-0-art")).toHaveAttribute(
      "data-art-kind",
      "scryfall",
    );
    await expectNoSeriousA11yViolations(page);

    await page.goto("/play?quick=mtg.commander&players=4&seed=7&names=Conner,Josh,JP,Bethany");
    await page.getByTestId("seat-2-name").click();
    await page.getByTestId("seat-load-profile").click();
    await page.getByTestId("profile-option-0").click();
    await page.getByTestId("deck-option-none").click();
    await page.getByTestId("seat-menu-close").click();
    await expect(page.getByTestId("seat-2-art")).toHaveAttribute("data-art-kind", "scryfall");
    await expect(page.getByTestId("seat-2-art")).not.toHaveAttribute("data-art-src", "none");
    const art = (await seatArts(page))[2];
    expect(art).toMatchObject({ kind: "scryfall", cardName: "Sol Ring", origin: "profile" });
  });

  // @req PROF-010 @req ART-008 @req A11Y-002
  test("deck commanders come from Scryfall; picking one sets the deck's background", async ({
    page,
    context,
  }) => {
    const log = await routeScryfall(context);
    await page.goto("/profiles");
    await page.getByTestId("profile-new").click();
    await page.getByTestId("profile-name-input").fill("JP");
    await page.getByTestId("profile-save").click();
    await page.getByTestId("deck-new").click();
    await page.getByTestId("deck-name-input").fill("Superfriends");
    await page.getByTestId("deck-preset").selectOption("mtg.commander");
    await page.getByTestId("deck-commander-0").pressSequentially("atra", { delay: 30 });
    await expect(page.getByTestId("deck-commander-0-option-0")).toHaveText(
      "Atraxa, Praetors' Voice",
    );
    expect(log.api.some((u) => u.includes("is%3Acommander"))).toBe(true);
    await expectNoSeriousA11yViolations(page);
    await page.getByTestId("deck-commander-0-option-0").click();
    await expect(page.getByTestId("deck-commander-0")).toHaveValue("Atraxa, Praetors' Voice");
    await expect(page.getByTestId("deck-commander-0-suggestions")).toHaveCount(0);
    await expect(page.getByTestId("deck-bg-preview")).toHaveAttribute("data-art-kind", "scryfall");
    await expect(page.getByTestId("deck-bg-caption")).toHaveText("Atraxa, Praetors' Voice");

    // Partner slot: lenient, Backgrounds included.
    await page.getByTestId("deck-partner").click();
    await page.getByTestId("deck-commander-1").pressSequentially("raised", { delay: 30 });
    await expect(page.getByTestId("deck-commander-1-option-0")).toContainText("Raised by Giants");
    await expect(page.getByTestId("deck-commander-1-option-0")).toContainText("Background");
    await page.getByTestId("deck-commander-1-option-0").click();
    await expect(page.getByTestId("deck-commander-1")).toHaveValue("Raised by Giants");
    // the first commander's art stays (no split backgrounds yet)
    await expect(page.getByTestId("deck-bg-caption")).toHaveText("Atraxa, Praetors' Voice");

    await page.getByTestId("deck-save").click();
    await expect(page.getByTestId("deck-row-0")).toContainText(
      "Atraxa, Praetors' Voice · Raised by Giants",
    );
    await expect(page.getByTestId("deck-row-0-art")).toHaveAttribute("data-art-kind", "scryfall");

    // The background stays editable: reopen, adjust the crop, save.
    await page.getByTestId("deck-row-0").click();
    await page.getByTestId("deck-bg-change").click();
    await page.getByTestId("art-adjust").click();
    await page.getByTestId("art-focal-save").click();
    await page.getByTestId("deck-bg-done").click();
    await expect(page.getByTestId("deck-bg-caption")).toHaveText("Atraxa, Praetors' Voice");
  });

  // @req PROF-010
  test("offline, commander fields fall back to free text with a note", async ({
    page,
    context,
  }) => {
    await routeScryfall(context);
    await page.goto("/profiles");
    await page.getByTestId("profile-new").click();
    await page.getByTestId("profile-name-input").fill("Off");
    await page.getByTestId("profile-save").click();
    await page.getByTestId("deck-new").click();
    await page.getByTestId("deck-name-input").fill("Offline deck");
    await context.setOffline(true);
    await page.getByTestId("deck-commander-0").fill("Tymna the Weaver");
    await expect(page.getByTestId("deck-commander-0-offline")).toBeVisible();
    await expect(page.getByTestId("deck-commander-0-suggestions")).toHaveCount(0);
    await expectNoSeriousA11yViolations(page);
    await page.getByTestId("deck-save").click();
    await expect(page.getByTestId("deck-row-0")).toContainText("Tymna the Weaver");
    // back online, suggestions return
    await context.setOffline(false);
    await page.waitForFunction(() => navigator.onLine);
    await page.getByTestId("deck-row-0").click();
    const input = page.getByTestId("deck-commander-0");
    await expect(input).toHaveValue("Tymna the Weaver");
    await expect(async () => {
      await input.fill("");
      await input.pressSequentially("tym", { delay: 30 });
      await expect(page.getByTestId("deck-commander-0-option-0")).toHaveText("Tymna the Weaver", {
        timeout: 3000,
      });
    }).toPass({ timeout: 15_000 });
  });
});

test.describe("set seat backgrounds to commanders", () => {
  // @req PROF-010 @req ART-008 @req A11Y-002
  test("on (Commander default): every seat with a deck starts on its commander's art", async ({
    page,
    context,
  }) => {
    await routeScryfall(context);
    await setupWithProfiles(page);
    await expect(page.getByTestId("setup-commander-art")).toHaveAttribute("aria-checked", "true");
    await expectNoSeriousA11yViolations(page);
    await page.getByTestId("setup-start-game").click();
    await expect(page).toHaveURL(/\/play$/);
    for (let i = 0; i < 4; i++)
      await expect(page.getByTestId(`seat-${i}-art`)).toHaveAttribute("data-art-kind", "scryfall");
    const arts = await seatArts(page);
    expect(arts.map((a) => [a?.cardName, a?.origin])).toEqual(
      COMMANDERS.map((c) => [c, "commander"]),
    );
  });

  // @req PROF-010 @req ART-008
  test("off: seats keep their profile art or stay blank", async ({ page, context }) => {
    const log = await routeScryfall(context);
    await setupWithProfiles(page);
    await page.getByTestId("setup-commander-art").click();
    await expect(page.getByTestId("setup-commander-art")).toHaveAttribute("aria-checked", "false");
    await page.getByTestId("setup-start-game").click();
    await expect(page).toHaveURL(/\/play$/);
    await expect(page.getByTestId("seat-0-art")).toHaveAttribute("data-art-kind", "solid");
    await expect(page.getByTestId("seat-1-art")).toHaveAttribute("data-art-kind", "default");
    await expect(page.getByTestId("seat-2-art")).toHaveAttribute("data-art-kind", "solid");
    await expect(page.getByTestId("seat-3-art")).toHaveAttribute("data-art-kind", "default");
    expect((await seatArts(page)).map((a) => a?.origin)).toEqual([
      "profile",
      undefined,
      "profile",
      undefined,
    ]);
    expect(log.api.filter((u) => u.startsWith("/cards/named"))).toEqual([]);

    // Remembered as the Commander preset's default for the next setup…
    await page.goto("/setup");
    await page.getByTestId("setup-next").click();
    await page.getByTestId("setup-next").click();
    await page.getByTestId("setup-next").click();
    await expect(page.getByTestId("setup-commander-art")).toHaveAttribute("aria-checked", "false");
    // …and switchable for the current game in Settings, which then applies it.
    await page.goto("/settings");
    await expect(page.getByTestId("settings-scope")).toContainText("current");
    const row = page.getByTestId("setting-commanderArt-control");
    await expect(row).toHaveAttribute("aria-checked", "false");
    await row.click();
    await expect(row).toHaveAttribute("aria-checked", "true");
    await expect.poll(() => storedCommanderArt(page)).toBe(true);
    await page.goto("/play");
    await expect(page.getByTestId("seat-1-art")).toHaveAttribute("data-art-kind", "scryfall");
    await expect
      .poll(async () => (await seatArts(page)).map((a) => a?.cardName))
      .toEqual(COMMANDERS);
  });

  // @req PROF-010 @req ART-008
  test("mid-game: a new commander brings its art; art picked by hand wins; offline degrades quietly", async ({
    page,
    context,
  }) => {
    const log = await routeScryfall(context);
    await page.goto("/play?quick=mtg.commander&players=4&seed=7&names=Conner,Josh,JP,Bethany");
    await expect(page.getByTestId("board")).toBeVisible();

    // seat 1 picks Kenrith from the Scryfall suggestions in the seat menu
    await page.getByTestId("seat-1-name").click();
    await page.getByTestId("seat-commander-0").pressSequentially("kenr", { delay: 30 });
    await page.getByTestId("seat-commander-0-option-0").click();
    await expect(page.getByTestId("seat-commander-0")).toHaveValue("Kenrith, the Returned King");
    await page.getByTestId("seat-menu-close").click();
    await expect(page.getByTestId("seat-1-art")).toHaveAttribute("data-art-kind", "scryfall");
    expect((await seatArts(page))[1]).toMatchObject({
      cardName: "Kenrith, the Returned King",
      origin: "commander",
    });

    // seat 0 picks a gradient by hand, then names a commander: the hand-picked art stays
    await page.getByTestId("seat-0-name").click();
    await page.getByTestId("bg-gradient-ember").click();
    await page.getByTestId("seat-commander-0").fill("Edgar Markov");
    await page.getByTestId("seat-commander-0").press("Enter");
    await page.getByTestId("seat-menu-close").click();
    await expect.poll(async () => (await seatArts(page))[0]?.kind).toBe("gradient");

    // offline: a commander looked up before comes from the cache; an unknown one waits quietly
    // (emulated offline doesn't stop Playwright routes, so the API host fails like a real outage)
    const outage = (route: Route) => route.abort("internetdisconnected");
    await context.route("https://api.scryfall.com/**", outage);
    await context.setOffline(true);
    for (const [i, name] of [
      [2, "Kenrith, the Returned King"],
      [3, "Yuriko, the Tiger's Shadow"],
    ] as const) {
      await page.getByTestId(`seat-${i}-name`).click();
      await page.getByTestId("seat-commander-0").fill(name);
      await expect(page.getByTestId("seat-commander-0-offline")).toBeVisible();
      await page.getByTestId("seat-commander-0").press("Enter");
      await page.getByTestId("seat-menu-close").click();
    }
    await expect(page.getByTestId("seat-2-art")).toHaveAttribute("data-art-kind", "scryfall");
    await expect(page.getByTestId("seat-2-art")).toHaveAttribute("data-art-src", "copy");
    await expect(page.getByTestId("seat-3-art")).toHaveAttribute("data-art-kind", "default");
    const before = log.api.length;
    await context.unroute("https://api.scryfall.com/**", outage);
    await context.setOffline(false);
    await expect(page.getByTestId("seat-3-art")).toHaveAttribute("data-art-kind", "scryfall");
    expect(log.api.slice(before).some((u) => u.includes("Yuriko"))).toBe(true);
  });
});
