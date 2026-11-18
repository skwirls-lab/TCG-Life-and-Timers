// @req GAME-011 @req LIFE-006 @req CMD-002 @req CMD-003 @req TMR-032 @req TMR-005 @req TMR-006 @req SET-033 @req PRE-013 @req SET-040 @req ART-006 @req HIST-001 @req GAME-015
/**
 * Product review A fixes (A-1 … A-12): first player on the board, partner mini-grid values,
 * the Pokémon / Yu-Gi-Oh! match timer with per-seat clocks off, the Digimon memory track, FFTCG
 * pips, the compact response banner, snackbar placement, camera-mode names, SWU base HP, copy.
 */
import { expect, test, type Page } from "@playwright/test";
import { menuTap, openMenu } from "./support/menu";
import { T0 } from "./support/timer";

const NAMES = "Conner,Josh,JP,Bethany,Ann,Bo";
const play = (q: string) => `/play?seed=7&names=${NAMES}&s.hideSystemBars=0&${q}`;

async function game(page: Page) {
  await expect.poll(() => page.evaluate(() => !!window.__tcg?.getState().session)).toBe(true);
  return page.evaluate(() => window.__tcg!.getState().session!.game);
}

/** Quick-start and wait until the test hooks hold the session. */
async function start(page: Page, q: string) {
  await page.goto(play(q));
  await expect(page.getByTestId("seat-0")).toBeVisible();
  await game(page);
}

test.describe("A-1 first player on the board", () => {
  test("the announcement lands on the starter's tile and every tile names the starter", async ({
    page,
  }) => {
    await page.goto(play("quick=mtg.commander&players=4&fp=1"));
    const overlay = page.getByTestId("first-player-overlay");
    await expect(overlay).toHaveAttribute("data-mode", "tiles");
    await page.getByTestId("first-player-skip").click({ position: { x: 12, y: 12 } });
    await expect(overlay).toHaveAttribute("data-landed", "1");
    const g = await game(page);
    const first = g.seats.findIndex((s) => s.id === g.turn.firstSeat);
    const name = g.seats[first]!.name;
    await expect(page.getByTestId(`first-player-name-${first}`)).toHaveAttribute(
      "data-highlight",
      "1",
    );
    // The result faces every player: the starter's tile and a copy on each other tile.
    await expect(page.getByTestId("first-player-result")).toHaveText(`${name} goes first`);
    for (let i = 0; i < 4; i++) {
      if (i === first) continue;
      await expect(page.getByTestId(`first-player-result-${i}`)).toHaveText(`${name} goes first`);
    }
    // The highlight box sits on the starter's tile.
    const box = (await page.getByTestId(`first-player-name-${first}`).boundingBox())!;
    const tile = (await page.getByTestId(`seat-${first}`).boundingBox())!;
    expect(Math.abs(box.x + box.width / 2 - (tile.x + tile.width / 2))).toBeLessThan(4);
    expect(Math.abs(box.y + box.height / 2 - (tile.y + tile.height / 2))).toBeLessThan(4);
    await page.getByTestId("first-player-skip").click({ position: { x: 12, y: 12 } });
    await expect(overlay).toBeHidden();
    // Turn tracking is off by default, yet the starter's tile is marked.
    expect(g.options.turnTracking).toBe(false);
    await expect(page.getByTestId(`seat-${first}-first`)).toBeVisible();
    await expect(page.getByTestId(`seat-${first}`)).toHaveClass(/ring-accent/);
    await expect(page.locator('[data-testid$="-first"]')).toHaveCount(1);
  });

  test("the marker leaves on the first counter change, and after 10 s", async ({ page }) => {
    await page.clock.install({ time: T0 });
    await start(page, "quick=mtg.commander&players=4");
    const g = await game(page);
    const first = g.seats.findIndex((s) => s.id === g.turn.firstSeat);
    const marker = page.getByTestId(`seat-${first}-first`);
    await expect(marker).toBeVisible();
    await page.getByTestId(`seat-${(first + 1) % 4}-minus`).click();
    await expect(marker).toBeHidden();

    await start(page, "quick=mtg.commander&players=4");
    const g2 = await game(page);
    const first2 = g2.seats.findIndex((s) => s.id === g2.turn.firstSeat);
    await expect(page.getByTestId(`seat-${first2}-first`)).toBeVisible();
    await page.clock.runFor(10_500);
    await expect(page.getByTestId(`seat-${first2}-first`)).toBeHidden();
  });

  test("the reset Undo snackbar does not cover the result or the menu button", async ({ page }) => {
    await page.goto(play("quick=mtg.constructed&players=2"));
    await expect(page.getByTestId("seat-0-value")).toHaveText("20");
    await page.evaluate(() => window.__tcg!.dispatch({ type: "RESET_GAME" }));
    await expect(page.getByTestId("first-player-overlay")).toHaveAttribute("data-landed", "1", {
      timeout: 5000,
    });
    const snack = page.getByTestId("snackbar");
    await expect(snack).toContainText("Game reset");
    await expect(snack).toHaveAttribute("data-anchored", "1");
    const s = (await snack.boundingBox())!;
    const result = (await page.getByTestId("first-player-result").boundingBox())!;
    const toolbar = (await page.getByTestId("center-menu").boundingBox())!;
    const overlaps = (a: typeof s, b: typeof s) =>
      a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;
    expect(overlaps(s, result)).toBe(false);
    expect(overlaps(s, toolbar)).toBe(false);
  });
});

test.describe("A-2 partner mini-grid", () => {
  for (const players of [4, 6]) {
    test(`two-digit partner damage is shown in full (${players}p)`, async ({ page }) => {
      await page.goto(play(`quick=mtg.commander&players=${players}`));
      await expect(page.getByTestId("seat-0-value")).toHaveText("40");
      await page.evaluate(() => {
        const g = window.__tcg!.getState().session!.game;
        const [a, , c] = g.seats.map((s) => s.id);
        const d = window.__tcg!.dispatch;
        d({ type: "SEAT_SET_COMMANDERS", seatId: a!, commanders: ["A", "B"] });
        d({
          type: "CMD_DAMAGE_ADD",
          targetSeatId: c!,
          sourceSeatId: a!,
          sourceIndex: 0,
          delta: 14,
        });
        d({
          type: "CMD_DAMAGE_ADD",
          targetSeatId: c!,
          sourceSeatId: a!,
          sourceIndex: 1,
          delta: 12,
        });
      });
      await expect(page.getByTestId("seat-2-cmd-0-v0")).toHaveText("14");
      await expect(page.getByTestId("seat-2-cmd-0-v1")).toHaveText("12");
      await page.evaluate(() => {
        const g = window.__tcg!.getState().session!.game;
        const [a, , c] = g.seats.map((s) => s.id);
        window.__tcg!.dispatch({
          type: "CMD_DAMAGE_ADD",
          targetSeatId: c!,
          sourceSeatId: a!,
          sourceIndex: 0,
          delta: 7,
        });
      });
      await expect(page.getByTestId("seat-2-cmd-0-v0")).toHaveText("21");
      // Nothing is clipped: each value fits its box and the cell fits its contents.
      const clipped = await page.evaluate(() =>
        [...document.querySelectorAll('[data-testid^="seat-"][data-testid*="-cmd-"]')]
          .filter(
            (el) =>
              /-v\d$/.test(el.getAttribute("data-testid") ?? "") || el.matches("[data-split]"),
          )
          .filter((el) => el.scrollWidth > el.clientWidth + 0.5)
          .map((el) => el.getAttribute("data-testid")),
      );
      expect(clipped).toEqual([]);
      const cell = page.getByTestId("seat-2-cmd-0");
      const c = (await cell.boundingBox())!;
      for (const k of [0, 1]) {
        const v = (await page.getByTestId(`seat-2-cmd-0-v${k}`).boundingBox())!;
        expect(v.x).toBeGreaterThanOrEqual(c.x - 0.5);
        expect(v.y).toBeGreaterThanOrEqual(c.y - 0.5);
        expect(v.x + v.width).toBeLessThanOrEqual(c.x + c.width + 0.5);
        expect(v.y + v.height).toBeLessThanOrEqual(c.y + c.height + 0.5);
      }
    });
  }
});

test.describe("A-3 match timer with per-seat clocks off", () => {
  test("Pokémon: START runs the 50 min round clock, then TIME with 3 extra turns", async ({
    page,
  }) => {
    await page.clock.install({ time: T0 });
    await page.goto(play("quick=pokemon.standard&players=2"));
    await expect(page.getByTestId("seat-0-value")).toHaveText("6");
    await page.clock.pauseAt(T0 + 60_000);
    expect((await game(page)).timer.mode).toBe("off");
    await expect(page.getByTestId("match-clock-time")).toHaveText("50:00");
    // No per-seat clocks.
    await expect(page.locator('[data-testid$="-clock"][data-testid^="seat-"]')).toHaveCount(0);
    await menuTap(page, "timer-start");
    await expect(page.getByTestId("center-menu")).toHaveAttribute("data-clock", "running");
    await page.clock.fastForward(10 * 60_000);
    await expect(page.getByTestId("match-clock-time")).toHaveText("40:00");
    await page.clock.fastForward(40 * 60_000);
    await page.clock.runFor(1000);
    await expect(page.getByTestId("match-time-called")).toHaveText("TIME · 3");
    await expect(page.getByTestId("snackbar")).toContainText("TIME");
  });

  test("Yu-Gi-Oh!: 40 min round clock with 2 extra turns; Settings shows the match rows", async ({
    page,
  }) => {
    await page.goto(play("quick=ygo.advanced&players=2"));
    await expect(page.getByTestId("match-clock-time")).toHaveText("40:00");
    await expect(page.getByTestId("center-menu")).toHaveAttribute("data-clock", "start");
    // Open Settings from the board (the live game is the one being edited).
    await menuTap(page, "toolbar-settings");
    await expect(page.getByTestId("setting-timer.mode-control")).toHaveValue("off");
    await expect(page.getByTestId("setting-timer.match-control")).toHaveValue("40");
    await expect(page.getByTestId("setting-timer.extraTurns-control")).toHaveValue("2");
  });
});

test.describe("A-4 Digimon memory track", () => {
  test("the shared gauge sits between the seats and moves toward each player", async ({ page }) => {
    await page.goto(play("quick=digimon.standard&players=2"));
    const track = page.getByTestId("track-digimon.memory");
    await expect(track).toBeVisible();
    await expect(track).toHaveAttribute("data-value", "0");
    const toolbar = (await page.getByTestId("toolbar").boundingBox())!;
    const tb = (await track.boundingBox())!;
    expect(tb.y).toBeGreaterThanOrEqual(toolbar.y - 1);
    expect(tb.y + tb.height).toBeLessThanOrEqual(toolbar.y + toolbar.height + 1);
    // Seat 1 (Conner, top in portrait) owns the positive side, on his right = screen left.
    const plusAtEnd = (await track.getAttribute("data-plus-at-end")) === "1";
    const conner = plusAtEnd ? "end" : "start";
    const josh = plusAtEnd ? "start" : "end";
    await expect(page.getByTestId(`track-digimon.memory-${conner}-owner`)).toHaveText("Conner");
    await expect(page.getByTestId(`track-digimon.memory-${josh}-owner`)).toHaveText("Josh");
    await page.getByTestId(`track-digimon.memory-${conner}`).click();
    await page.getByTestId(`track-digimon.memory-${conner}`).click();
    await expect(track).toHaveAttribute("data-value", "2");
    await expect(track).toHaveAttribute("aria-label", "Memory 2 on Conner's side");
    for (let i = 0; i < 5; i++) await page.getByTestId(`track-digimon.memory-${josh}`).click();
    await expect(track).toHaveAttribute("data-value", "-3");
    await expect(page.getByTestId("track-digimon.memory-marker")).toHaveText("3");
    // MENU: the center button sits on the strip beside the track, clear of the gauge.
    const btn = (await page.getByTestId("center-menu").boundingBox())!;
    expect(btn.y).toBeGreaterThanOrEqual(toolbar.y - 1);
    expect(btn.y + btn.height).toBeLessThanOrEqual(toolbar.y + toolbar.height + 1);
    const apart =
      btn.y >= tb.y + tb.height - 1 ||
      btn.y + btn.height <= tb.y + 1 ||
      btn.x >= tb.x + tb.width - 1 ||
      btn.x + btn.width <= tb.x + 1;
    expect(apart).toBe(true);
    // Every menu item is on screen.
    await openMenu(page);
    for (const id of ["toolbar-reset", "toolbar-settings", "toolbar-tools"]) {
      const b = (await page.getByTestId(id).boundingBox())!;
      expect(b.x + b.width).toBeLessThanOrEqual(page.viewportSize()!.width + 1);
    }
  });
});

test.describe("A-6 FFTCG pips", () => {
  test("damage fills 7 slots with an accessible label", async ({ page }) => {
    await page.goto(play("quick=fftcg.standard&players=2"));
    const pips = page.getByTestId("seat-1-pips");
    await expect(pips).toHaveAttribute("data-max", "7");
    await expect(page.locator('[data-testid^="seat-1-pip-"]')).toHaveCount(7);
    for (let i = 0; i < 3; i++) await page.getByTestId("seat-1-plus").click();
    await expect(pips).toHaveAttribute("aria-label", "Damage 3 of 7");
    await expect(page.locator('[data-testid^="seat-1-pip-"][data-filled="1"]')).toHaveCount(3);
    await expect(page.getByTestId("seat-1-value")).toHaveText("3");
  });
});

test.describe("A-7 response banner", () => {
  test("compact tiles keep the responder's name and label the buttons", async ({ page }) => {
    await page.goto(play("quick=mtg.commander&players=4&t.mode=bank&t.bankMs=600000"));
    await menuTap(page, "timer-start");
    const g = await game(page);
    const active = g.seats.findIndex((s) => s.id === g.turn.activeSeat);
    const responder = (active + 1) % 4;
    await page.getByTestId(`seat-${responder}-respond`).click();
    const other = (active + 2) % 4;
    const name = page.getByTestId(`seat-${other}-banner-name`);
    await expect(name).toBeVisible();
    await expect(name).toHaveText(g.seats[responder]!.name);
    // Rotated tiles: the name's length runs along either axis.
    const nb = (await name.boundingBox())!;
    expect(Math.max(nb.width, nb.height)).toBeGreaterThan(20);
    await expect(page.getByTestId(`seat-${responder}-passback`)).toHaveAccessibleName("Pass back");
    await expect(page.getByTestId(`seat-${other}-respond`)).toHaveAccessibleName("Respond");
    await expect(page.getByTestId(`seat-${other}-respond`)).toContainText("Respond");
  });
});

test.describe("A-8 snackbars", () => {
  test("elimination Undo sits on the eliminated tile; PAUSED hides snackbars", async ({ page }) => {
    await start(page, "quick=mtg.commander&players=4&t.mode=bank&t.bankMs=600000");
    await page.evaluate(() => {
      const g = window.__tcg!.getState().session!.game;
      window.__tcg!.dispatch({ type: "ELIMINATE", seatId: g.seats[2]!.id });
    });
    const snack = page.getByTestId("snackbar");
    await expect(snack).toContainText("JP eliminated");
    await expect(snack).toHaveAttribute("data-anchored", "1");
    const s = (await snack.boundingBox())!;
    const tile = (await page.getByTestId("seat-2").boundingBox())!;
    const cx = s.x + s.width / 2;
    const cy = s.y + s.height / 2;
    expect(cx).toBeGreaterThan(tile.x);
    expect(cx).toBeLessThan(tile.x + tile.width);
    expect(cy).toBeGreaterThan(tile.y);
    expect(cy).toBeLessThan(tile.y + tile.height);
    await snack.getByTestId("snackbar-action").click();

    await menuTap(page, "timer-start");
    const g = await game(page);
    const active = g.seats.findIndex((x) => x.id === g.turn.activeSeat);
    await page.getByTestId(`seat-${active}-pass`).click();
    await expect(page.getByTestId("snackbar")).toContainText("Passed to");
    await menuTap(page, "toolbar-clock");
    await expect(page.getByTestId("timer-paused")).toBeVisible();
    await expect(page.getByTestId("snackbar")).toBeHidden();
    await page.getByTestId("timer-resume").click();
  });
});

test.describe("A-9 camera mode names", () => {
  test("names are not truncated when the tile has room", async ({ page }) => {
    await page.goto(play("quick=mtg.commander&players=4&s.cameraMode=bottom"));
    await expect(page.getByTestId("seat-0-value")).toHaveText("40");
    for (let i = 0; i < 4; i++) {
      const span = page.getByTestId(`seat-${i}-name`).locator("span").first();
      const fits = await span.evaluate((el) => el.scrollWidth <= el.clientWidth);
      expect(fits, `seat ${i} name fits`).toBe(true);
    }
  });
});

test.describe("A-10 SWU base HP", () => {
  test("each tile and seat menu show the seat's base HP; setup reads naturally", async ({
    page,
  }) => {
    await page.goto(play("quick=swu.premier&players=2"));
    await expect(page.getByTestId("seat-0-limit")).toHaveText("Base HP 30");
    await page.getByTestId("seat-1-name").click();
    await page.getByTestId("seat-menu-tab-counters").click();
    await expect(page.getByTestId("seat-limit")).toContainText("Base HP");
    await expect(page.getByTestId("seat-limit")).toContainText("30");

    await page.goto("/setup");
    await page.getByTestId("setup-preset").getByTestId("preset-select-swu.premier").first().click();
    for (let i = 0; i < 3; i++) await page.getByTestId("setup-next").click();
    await expect(page.getByTestId("setup-per-seat")).toContainText("Base HP per player");
    await expect(page.getByTestId("setup-start-custom")).toHaveCount(0);
  });
});

test.describe("A-11 copy", () => {
  test("What's new and About show the installed version", async ({ page }) => {
    await page.goto("/whats-new");
    await expect(page.getByTestId("whats-new-installed")).toContainText("1.1.0");
    await expect(page.getByTestId("release-1.0.0")).toBeVisible();
  });

  test("Pokémon offers the coin choice before announcing a starter", async ({ page }) => {
    await page.goto("/play?quick=pokemon.standard&names=Ash,Gary&fp=1");
    await expect(page.getByTestId("first-player-coin-offer")).toBeVisible();
    await expect(page.getByTestId("first-player-result")).toHaveCount(0);
    await page.getByTestId("first-player-coin-skip").click();
    await expect(page.getByTestId("first-player-overlay")).toBeHidden();
  });

  test("Share the app and Clear image cache work from Settings", async ({ page }) => {
    await page.goto("/settings");
    await page.evaluate(() => {
      Object.defineProperty(navigator, "share", { value: undefined, configurable: true });
      Object.defineProperty(navigator, "clipboard", {
        value: { writeText: async () => undefined },
        configurable: true,
      });
    });
    await page.getByTestId("setting-share-control").click();
    await expect(page.getByTestId("snackbar").filter({ hasText: "Link copied" })).toBeVisible();
    await page.evaluate(async () => {
      const c = await caches.open("scryfall-images");
      await c.put("https://cards.scryfall.io/x.jpg", new Response(new Uint8Array(4096)));
    });
    await page.getByTestId("setting-clearImageCache-control").click();
    await expect(page.getByTestId("image-cache-size")).toHaveText("Cached art: 4 KB");
    await page.getByTestId("image-cache-confirm").click();
    await expect(
      page.getByTestId("snackbar").filter({ hasText: "Image cache cleared (4 KB)" }),
    ).toBeVisible();
    expect(await page.evaluate(async () => (await caches.keys()).includes("scryfall-images"))).toBe(
      false,
    );
  });

  test("History calls the current game 'Game N'", async ({ page }) => {
    await start(page, "quick=mtg.commander&players=4");
    await page.getByTestId("seat-0-minus").click();
    await menuTap(page, "toolbar-history");
    await expect(page.getByTestId("history-game-title")).toHaveText(/^Game \d+$/);
  });
});

test.describe("A-12 seat menu", () => {
  test("the tab bar is opaque and edged", async ({ page }) => {
    await page.goto(play("quick=mtg.commander&players=4"));
    await page.getByTestId("seat-0-name").click();
    const bar = page.getByTestId("seat-menu-tab").locator("..");
    const bg = await bar.evaluate((el) => getComputedStyle(el).backgroundColor);
    expect(bg).toMatch(/^rgb\(/); // fully opaque (no alpha)
    expect(await bar.evaluate((el) => getComputedStyle(el).position)).toBe("sticky");
  });
});
