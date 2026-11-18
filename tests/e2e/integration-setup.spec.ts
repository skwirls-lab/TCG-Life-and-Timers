// @req CUS-001 @req PRE-003 @req GAME-001 @req PRE-013 @req GAME-013 @req TOOL-004 @req GAME-012 @req TOOL-002 @req TOOL-012
/**
 * INTEGRATE-A: setup ↔ custom presets (builder), quick start with a custom preset, per-seat
 * start/threshold values, roll-off, the Pokémon coin + first-turn hint, scratch counters.
 */
import { expect, test, type Page } from "@playwright/test";
import { expectNoSeriousA11yViolations } from "./support/axe";

/** Tap a corner of the full-screen first-player overlay. */
const CORNER = { position: { x: 12, y: 12 } };

interface GameView {
  id: string;
  status: string;
  preset: { id: string; name: string };
  seats: { id: string; name: string; eliminated: boolean }[];
  turn: { firstSeat: string; rolloff?: Record<string, number[]> };
  perSeatStart: Record<string, Record<string, number>>;
  perSeatThreshold: Record<string, Record<string, number | null>>;
  log: { kind: string; meta?: Record<string, unknown> }[];
}

async function game(page: Page): Promise<GameView> {
  return page.evaluate(() => window.__tcg!.getState().session!.game as unknown as GameView);
}

/** /play after a setup Start (test hooks are installed by the board's own boot). */
async function onPlay(page: Page) {
  await expect(page).toHaveURL(/\/play$/);
  await expect.poll(() => page.evaluate(() => !!window.__tcg?.getState().session)).toBe(true);
}

/** Build a custom preset JSON from the built-in Generic preset and import it in the builder. */
async function importCustomPreset(page: Page, name: string, start: number): Promise<string> {
  await page.goto("/play?quick=generic.life&players=2");
  await expect.poll(() => page.evaluate(() => !!window.__tcg?.getState().session)).toBe(true);
  const json = await page.evaluate(
    ({ name, start }) => {
      const p = structuredClone(window.__tcg!.getState().session!.game.preset);
      p.name = name;
      p.game = "House Rules";
      p.builtIn = false;
      const primary = p.counters.find((c) => c.isPrimary)!;
      primary.name = "Glory";
      primary.start = start;
      p.quickStartValues = [start, start * 2];
      return JSON.stringify(p);
    },
    { name, start },
  );
  await page.goto("/builder");
  await page.getByTestId("builder-import-open").click();
  await page.getByTestId("builder-import-text").fill(json);
  await page.getByTestId("builder-import-submit").click();
  await expect(page.getByTestId("builder-import-sheet")).toBeHidden();
  await expect(page.getByTestId("builder-preset-0-name")).toHaveText(name);
  const id = await page.getByTestId("builder-preset-0").getAttribute("data-preset-id");
  expect(id).toMatch(/^custom\./);
  return id!;
}

test("a custom preset from the builder appears in setup, starts, and quick-starts again", async ({
  page,
}) => {
  const id = await importCustomPreset(page, "Glory Race", 15);

  await page.goto("/");
  await page.getByTestId("launcher-new").click();
  const picker = page.getByTestId("setup-preset");
  await expect(picker).toHaveAttribute("data-all-loaded", "true");
  const section = picker.getByTestId("preset-section-game-house-rules");
  await expect(section.getByTestId(`preset-row-${id}`)).toBeVisible();
  await expect(section.getByTestId(`preset-custom-${id}`)).toHaveText("Custom");
  await expectNoSeriousA11yViolations(page);
  // ≤ 6 taps: New game (1) → pick (2) → Start (3)
  await section.getByTestId(`preset-select-${id}`).click();
  await expect(section.getByTestId(`preset-row-${id}`)).toHaveAttribute("data-selected", "true");
  await page.getByTestId("setup-start-game").click();
  await onPlay(page);
  const first = await game(page);
  expect(first.preset).toMatchObject({ id, name: "Glory Race" });
  await expect(page.getByTestId("seat-0-value")).toHaveText("15");
  await expect(page.getByTestId("seat-1-value")).toHaveText("15");

  // Recorded as Recent at Start (not on select).
  await page.goto("/setup");
  await expect(
    page.getByTestId("preset-section-recent").getByTestId(`preset-row-${id}`),
  ).toBeVisible();

  // Quick start: same as last game, with the custom preset.
  await page.goto("/");
  const quick = page.getByTestId("launcher-quick");
  await expect(quick).toContainText("Glory Race");
  await quick.click();
  await onPlay(page);
  await expect.poll(async () => (await game(page)).id).not.toBe(first.id);
  expect((await game(page)).preset.id).toBe(id);
  await expect(page.getByTestId("seat-0-value")).toHaveText("15");

  // Test hooks also quick-start custom presets (async).
  await page.goto(`/play?quick=${id}&players=3&names=A,B,C`);
  await expect
    .poll(() => page.evaluate(() => window.__tcg?.getState().session?.game.seats.length))
    .toBe(3);
  expect((await game(page)).preset.id).toBe(id);
});

test("SWU seats with 25 vs 30 base HP lose at their own thresholds (setup)", async ({ page }) => {
  await page.goto("/setup");
  await page.getByTestId("setup-preset").getByTestId("preset-select-swu.premier").first().click();
  await page.getByTestId("setup-next").click();
  await page.getByTestId("setup-next").click();
  await page.getByTestId("setup-seat-0-name").fill("Rey");
  await page.getByTestId("setup-seat-1-name").fill("Kylo");
  await page.getByTestId("setup-next").click();
  await expect(page.getByTestId("setup-per-seat")).toBeVisible();
  await expect(page.getByTestId("setup-verify-hint")).toContainText("Base damage");
  await expectNoSeriousA11yViolations(page);
  await page.getByTestId("setup-seat-0-threshold-25").click();
  await expect(page.getByTestId("setup-seat-0-threshold-25")).toHaveAttribute(
    "aria-checked",
    "true",
  );
  await expect(page.getByTestId("setup-seat-1-threshold-30")).toHaveAttribute(
    "aria-checked",
    "true",
  );
  await page.getByTestId("setup-start-game").click();
  await onPlay(page);
  const g = await game(page);
  expect(g.perSeatThreshold).toEqual({ s1: { "swu.baseDamage": 25 } });

  const set = (seatId: string, value: number) =>
    page.evaluate(
      ([seatId, value]) =>
        window.__tcg!.dispatch({
          type: "COUNTER_SET",
          counterId: "swu.baseDamage",
          seatId: seatId as string,
          value: value as number,
        }),
      [seatId, value] as const,
    );
  await set("s2", 25);
  await set("s1", 25);
  await expect
    .poll(async () => (await game(page)).seats.map((s) => s.eliminated))
    .toEqual([true, false]);
  expect((await game(page)).status).toBe("ended");
});

test("One Piece per-seat leader life in setup; SWU base HP in settings", async ({ page }) => {
  await page.goto("/setup");
  await page
    .getByTestId("setup-preset")
    .getByTestId("preset-select-onepiece.standard")
    .first()
    .click();
  for (let i = 0; i < 3; i++) await page.getByTestId("setup-next").click();
  await page.getByTestId("setup-seat-1-start-4").click();
  await page.getByTestId("setup-start-game").click();
  await onPlay(page);
  await expect(page.getByTestId("seat-0-value")).toHaveText("5");
  await expect(page.getByTestId("seat-1-value")).toHaveText("4");
  expect((await game(page)).perSeatStart).toEqual({ s2: { "op.life": 4 } });

  // Settings A → Per-player starting values (live game, one confirm).
  await page.goto("/settings?quick=swu.premier&players=2&names=A,B");
  await expect(page.getByTestId("settings-scope")).toContainText("current");
  await page.getByTestId("setting-perSeatStart-control").click();
  await expect(page.getByTestId("settings-sub-perSeatStart")).toBeVisible();
  await expectNoSeriousA11yViolations(page);
  await page.getByTestId("settings-seat-1-threshold-28").click();
  await page.getByTestId("settings-sub-apply").click();
  await page.getByTestId("confirm-reset-continue").click();
  await expect
    .poll(() => page.evaluate(() => window.__tcg?.getState().session?.game.perSeatThreshold))
    .toEqual({ s2: { "swu.baseDamage": 28 } });
});

test("roll-off: each seat's d20 is shown, the highest goes first", async ({ page }) => {
  await page.goto("/setup");
  await page.getByTestId("setup-next").click();
  await page.getByTestId("setup-next").click();
  for (const [i, name] of ["A", "B", "C", "D"].entries())
    await page.getByTestId(`setup-seat-${i}-name`).fill(name);
  await page.getByTestId("setup-next").click();
  await page.getByTestId("setup-first-player").selectOption("rolloff");
  await page.getByTestId("setup-start-game").click();
  await onPlay(page);
  const overlay = page.getByTestId("first-player-overlay");
  await expect(overlay).toHaveAttribute("data-rule", "rolloff");
  await expect(page.getByTestId("rolloff").locator("li")).toHaveCount(4);
  await page.getByTestId("first-player-skip").click(CORNER);
  await expect(overlay).toHaveAttribute("data-landed", "1");
  // The landed overlay auto-closes after 2 s, so read it in one go before anything slow (axe).
  const shown = await page.evaluate(() => ({
    rows: [0, 1, 2, 3].map((i) => {
      const el = document.querySelector(`[data-testid="rolloff-seat-${i}"]`);
      return {
        seatId: el?.getAttribute("data-seat-id") ?? "",
        rolls: el?.getAttribute("data-rolls") ?? "",
        winner: el?.getAttribute("data-winner") ?? "",
      };
    }),
    result: document.querySelector('[data-testid="first-player-result"]')?.textContent ?? "",
  }));
  await expectNoSeriousA11yViolations(page);

  const g = await game(page);
  const rolls = g.turn.rolloff!;
  for (const row of shown.rows) {
    expect(row.rolls).toBe(rolls[row.seatId]!.join(","));
    expect(row.winner).toBe(row.seatId === g.turn.firstSeat ? "1" : "0");
  }
  // The winner has the strictly highest roll of the last round (ties re-rolled).
  const win = rolls[g.turn.firstSeat]!;
  for (const [seatId, r] of Object.entries(rolls)) {
    if (seatId === g.turn.firstSeat || r.length < win.length) continue;
    expect(r.at(-1)!).toBeLessThan(win.at(-1)!);
  }
  const name = g.seats.find((s) => s.id === g.turn.firstSeat)!.name;
  expect(shown.result.trim()).toBe(`${name} goes first`);
});

test("Pokémon: opening coin flip decides, then the first-turn reminder shows once", async ({
  page,
}) => {
  await page.goto("/play?quick=pokemon.standard&names=Ash,Misty&fp=1");
  const overlay = page.getByTestId("first-player-overlay");
  await expect(overlay).toBeVisible();
  await expect(page.getByTestId("first-turn-hint")).toHaveCount(0);
  await page.getByTestId("first-player-coin").click();
  const result = page.getByTestId("first-player-coin-result");
  await expect(result).toBeVisible();
  await expect(result).toContainText("Ash is heads, Misty is tails");
  await expectNoSeriousA11yViolations(page);
  const face = await result.getAttribute("data-face");
  const winner = face === "heads" ? "Ash" : "Misty";
  await expect(result).toContainText(`${winner} wins the flip`);
  await page.getByTestId("first-player-coin-pick-1").click();
  await expect(page.getByTestId("first-player-result")).toHaveText("Misty goes first");
  await page.getByTestId("first-player-skip").click(CORNER);
  await expect(overlay).toBeHidden();

  const g = await game(page);
  expect(g.turn.firstSeat).toBe(g.seats[1]!.id);
  expect(g.log.some((e) => e.kind === "coin")).toBe(true);

  const hint = page.getByTestId("first-turn-hint");
  await expect(hint).toContainText(
    "The player going first can't attack or play a Supporter on their first turn",
  );
  await expect(hint).toContainText("Misty goes first");
  await expectNoSeriousA11yViolations(page);
  await page.getByTestId("first-turn-hint-dismiss").click();
  await expect(hint).toHaveCount(0);
});

test("scratch counters: add, rename, count, persist across reload, delete", async ({ page }) => {
  await page.goto("/tools");
  await page.getByTestId("tools-counters-link").click();
  await expect(page).toHaveURL(/\/tools\/counters$/);
  const root = page.getByTestId("counters-root");
  await expect(root).toHaveAttribute("data-loaded", "true");
  await expect(page.getByTestId("counters-empty")).toBeVisible();
  await page.getByTestId("counters-add").click();
  await page.getByTestId("counters-add").click();
  await page.getByTestId("counter-0-name").fill("Ink");
  for (let i = 0; i < 3; i++) await page.getByTestId("counter-0-plus").click();
  await page.getByTestId("counter-1-minus").click();
  await expect(page.getByTestId("counter-0-value")).toHaveText("3");
  await expect(page.getByTestId("counter-1-value")).toHaveText("-1");
  await expectNoSeriousA11yViolations(page);
  await expect(root).toHaveAttribute("data-saved", "true");

  await page.reload();
  await expect(root).toHaveAttribute("data-loaded", "true");
  await expect(page.getByTestId("counter-0-name")).toHaveValue("Ink");
  await expect(page.getByTestId("counter-0-value")).toHaveText("3");
  await expect(page.getByTestId("counter-1-name")).toHaveValue("Counter 2");
  await expect(page.getByTestId("counter-1-value")).toHaveText("-1");

  await page.getByTestId("counter-1-delete").click();
  await expect(page.getByTestId(/^counter-row-/)).toHaveCount(1);
  await page.getByTestId("counters-clear").click();
  await expect(page.getByTestId("counter-0-value")).toHaveText("0");
  await expect(root).toHaveAttribute("data-saved", "true");
  await page.reload();
  await expect(page.getByTestId("counter-0-value")).toHaveText("0");
  await expect(page.getByTestId(/^counter-row-/)).toHaveCount(1);
});

test("settings G row 'My presets' opens the builder", async ({ page }) => {
  await page.goto("/settings");
  await page.getByTestId("setting-myPresets-control").click();
  await expect(page).toHaveURL(/\/builder$/);
});
