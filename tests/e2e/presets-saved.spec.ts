// Presets (saved setups): save a whole setup, start it from a launcher tile, edit before starting,
// save from the game menu, the free limit, rename/reorder/delete, the "game type" wording.
// Presets have no PRD id of their own; nearest: PROF-010 (profiles/decks on seats) and SET-012
// (per-game-type defaults).
// @req PROF-010 @req SET-012 @req PAY-004 @req A11Y-002
import { expect, test, type Page } from "@playwright/test";
import { expectNoSeriousA11yViolations } from "./support/axe";
import { menuTap, openMenu } from "./support/menu";

const SHOTS = "artifacts/presets";
const CORNER = { position: { x: 12, y: 12 } };

interface SeedPlayer {
  id: string;
  name: string;
  color: string;
  deck: { id: string; name: string; commanders: string[]; art?: { kind: string; value: string } };
}

/** The weekly pod: four profiles with a Commander deck each; Ann's deck has its own background. */
const POD: SeedPlayer[] = ["Ann", "Ben", "Cid", "Dee"].map((name, i) => ({
  id: `p-${name.toLowerCase()}`,
  name,
  color: ["#f472b6", "#60a5fa", "#facc15", "#34d399"][i]!,
  deck: {
    id: `d-${name.toLowerCase()}`,
    name: `${name}'s deck`,
    commanders: [`Commander ${name}`],
    ...(i === 0 ? { art: { kind: "solid", value: "#7c3aed" } } : {}),
  },
}));

async function waitForDb(page: Page) {
  await expect
    .poll(() =>
      page.evaluate(async () => (await indexedDB.databases()).some((d) => d.name === "tcg-life")),
    )
    .toBe(true);
}

/** Run `fn(db)` against the app's IndexedDB in the page. */
async function idbPut(page: Page, store: string, rows: unknown[]) {
  await waitForDb(page);
  await page.evaluate(
    async ({ store, rows }) => {
      const db = await new Promise<IDBDatabase>((resolve, reject) => {
        const req = indexedDB.open("tcg-life");
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
      });
      await new Promise<void>((resolve, reject) => {
        const tx = db.transaction(store, "readwrite");
        for (const r of rows) tx.objectStore(store).put(r);
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
      });
      db.close();
    },
    { store, rows },
  );
}

async function idbAll<T>(page: Page, store: string): Promise<T[]> {
  return page.evaluate(async (store) => {
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const req = indexedDB.open("tcg-life");
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
    const rows = await new Promise<unknown[]>((resolve) => {
      const r = db.transaction(store, "readonly").objectStore(store).getAll();
      r.onsuccess = () => resolve(r.result as unknown[]);
      r.onerror = () => resolve([]);
    });
    db.close();
    return rows as never;
  }, store);
}

async function idbDelete(page: Page, store: string, key: string) {
  await page.evaluate(
    async ({ store, key }) => {
      const db = await new Promise<IDBDatabase>((resolve, reject) => {
        const req = indexedDB.open("tcg-life");
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
      });
      await new Promise<void>((resolve) => {
        const tx = db.transaction(store, "readwrite");
        tx.objectStore(store).delete(key);
        tx.oncomplete = () => resolve();
      });
      db.close();
    },
    { store, key },
  );
}

async function seedPod(page: Page) {
  await idbPut(
    page,
    "profiles",
    POD.map((p) => ({
      id: p.id,
      name: p.name,
      normalizedName: p.name.toLowerCase(),
      color: p.color,
      contrast: false,
      updatedAt: 1,
      schemaVersion: 1,
    })),
  );
  await idbPut(
    page,
    "decks",
    POD.map((p) => ({
      ...p.deck,
      profileId: p.id,
      presetId: "mtg.commander",
      updatedAt: 1,
      schemaVersion: 1,
    })),
  );
}

interface StoredSetupRow {
  id: string;
  name: string;
  order: number;
  presetId: string;
  seats: { name: string; profileId?: string; deckId?: string; clockExtraMs?: number }[];
  config: Record<string, unknown>;
}

/** A saved setup row in the shape of src/lib/setups/types.ts. */
function setupRow(id: string, name: string, order: number, o: Partial<StoredSetupRow> = {}) {
  return {
    id,
    schemaVersion: 1,
    name,
    presetId: "mtg.commander",
    presetName: "Commander",
    config: {
      startOverrides: { "mtg.life": 60 },
      thresholdOverrides: { "mtg.poison": 21 },
      timer: { mode: "bankDelay", bankMs: 1_200_000, delayMs: 5000, seatExtraMs: {} },
    },
    seats: POD.map((p, i) => ({
      name: p.name,
      color: p.color,
      commanders: [...p.deck.commanders],
      profileId: p.id,
      deckId: p.deck.id,
      deckName: p.deck.name,
      ...(i === 2 ? { clockExtraMs: 120_000 } : {}),
    })),
    firstPlayerRule: "random",
    commanderArt: true,
    order,
    createdAt: 1,
    updatedAt: 1,
    ...o,
  };
}

interface GameView {
  id: string;
  seats: { id: string; name: string; deckId?: string; art?: { origin?: string } }[];
  startOverrides: Record<string, number>;
  thresholdOverrides: Record<string, number | null>;
  enabledCounters: string[];
  timer: { config: { mode: string; delayMs: number; seatExtraMs?: Record<string, number> } };
  counters: Record<string, number>;
}

const game = (page: Page) =>
  page.evaluate(() => window.__tcg!.getState().session!.game as unknown as GameView);

async function onBoard(page: Page) {
  await expect(page).toHaveURL(/\/play(\?|$)/);
  await expect.poll(() => page.evaluate(() => !!window.__tcg?.getState().session)).toBe(true);
  const overlay = page.getByTestId("first-player-overlay");
  for (let i = 0; i < 4 && (await overlay.count()) > 0; i++) {
    await page.getByTestId("first-player-skip").click(CORNER);
    await page.waitForTimeout(150);
  }
  await expect(overlay).toHaveCount(0);
}

async function shot(page: Page, name: string, project: string) {
  await page.screenshot({ path: `${SHOTS}/${name}-${project}.png` });
}

test("build the weekly pod in Setup, save it as a preset, then start it from its tile", async ({
  page,
}, info) => {
  await page.goto("/setup");
  await expect(page.getByTestId("setup-step-preset")).toBeVisible();
  await seedPod(page);
  // House rule saved earlier as the game type's default (SET-012): 21 poison.
  await idbPut(page, "settings", [
    {
      key: "presetDefaults:mtg.commander",
      value: { thresholdOverrides: { "mtg.poison": 21 } },
      updatedAt: 1,
    },
  ]);
  await page.reload();
  await page.getByTestId("setup-next").click();
  await page.getByTestId("setup-next").click();
  await expect(page.getByTestId("setup-step-seats")).toBeVisible();
  for (const [i, p] of POD.entries()) {
    await page.getByTestId(`setup-seat-${i}-load`).click();
    await page
      .getByTestId("profile-picker")
      .getByRole("button", { name: p.name, exact: true })
      .click();
    await page.getByTestId("deck-option-0").click();
    await expect(page.getByTestId(`setup-seat-${i}-name`)).toHaveValue(p.name);
  }
  await page.getByTestId("setup-next").click();
  await expect(page.getByTestId("setup-step-options")).toBeVisible();
  await page.getByTestId("setup-start-60").click();
  const monarch = page.getByTestId("setup-counter-mtg.monarch");
  if ((await monarch.getAttribute("aria-checked")) !== "true") await monarch.click();
  await expect(monarch).toHaveAttribute("aria-checked", "true");
  await page.getByTestId("setup-clock-mode").selectOption("bankDelay");
  await page.getByTestId("setup-clock-bank-20").click();
  await page.getByTestId("setup-clock-step-5").click();
  await page.getByTestId("setup-seat-times-toggle").click();
  const cidPlus = page.getByTestId("setup-seat-times-2").locator("button").last();
  for (let i = 0; i < 2; i++) await cidPlus.click();
  await expect(page.getByTestId("setup-seat-times-extra-2")).toHaveText("+2:00");

  await page.getByTestId("setup-save-preset").click();
  const sheet = page.getByTestId("setup-save-sheet");
  await expect(sheet).toBeVisible();
  await expect(page.getByTestId("setup-save-name")).toHaveValue("Ann, Ben, Cid, Dee · Commander");
  await expectNoSeriousA11yViolations(page);
  await shot(page, "save-sheet-setup", info.project.name);
  await page.getByTestId("setup-save-name").fill("Friday pod");
  await page.getByTestId("setup-save-new").click();
  await expect(sheet).toHaveCount(0);
  await expect(page.getByTestId("snackbar")).toContainText("Friday pod");

  const [saved] = await idbAll<StoredSetupRow>(page, "setups");
  expect(saved).toMatchObject({ name: "Friday pod", presetId: "mtg.commander" });
  expect(saved!.seats.map((s) => s.deckId)).toEqual(POD.map((p) => p.deck.id));
  expect(saved!.seats[2]!.clockExtraMs).toBe(120_000);

  // The preset stands on its own: the game type's stored default is gone before we start it.
  await idbDelete(page, "settings", "presetDefaults:mtg.commander");
  await page.goto("/");
  const tile = page.getByTestId("setup-tile-0");
  await expect(tile).toBeVisible();
  await expect(page.getByTestId("setup-tile-0-name")).toHaveText("Friday pod");
  await expect(page.getByTestId("setup-tile-0-summary")).toHaveText("Commander · 4 players");
  await expectNoSeriousA11yViolations(page);
  await shot(page, "launcher-tiles", info.project.name);

  await page.getByTestId("setup-tile-0-start").click();
  await onBoard(page);
  const g = await game(page);
  expect(g.seats.map((s) => s.name)).toEqual(["Ann", "Ben", "Cid", "Dee"]);
  expect(g.seats.map((s) => s.deckId)).toEqual(POD.map((p) => p.deck.id));
  expect(g.seats[0]!.art?.origin).toBe("deck");
  expect(g.startOverrides).toEqual({ "mtg.life": 60 });
  expect(g.thresholdOverrides).toMatchObject({ "mtg.poison": 21 });
  expect(g.enabledCounters).toContain("mtg.monarch");
  expect(g.timer.config).toMatchObject({ mode: "bankDelay", delayMs: 5000 });
  expect(g.timer.config.seatExtraMs).toEqual({ s3: 120_000 });
  await expect(page.getByTestId("seat-0-value")).toHaveText("60");
  await expect(page.getByTestId("seat-0-name")).toContainText("Ann");
  await expect(page.getByTestId("center-menu")).toHaveAttribute("data-clock", "start");
});

test("Edit before starting: drop a seat, start with 3 players, then update the preset", async ({
  page,
}, info) => {
  await page.goto("/");
  await seedPod(page);
  await idbPut(page, "setups", [setupRow("pod", "Friday pod", 0)]);
  await page.reload();
  await page.getByTestId("setup-tile-0-edit").click();
  await expect(page).toHaveURL(/\/setup\?setup=pod$/);
  await expect(page.getByTestId("setup-step-seats")).toBeVisible();
  await expect(page.getByTestId("setup-seat-3-name")).toHaveValue("Dee");
  await expect(page.getByTestId("setup-seat-0-commander-0")).toHaveValue("Commander Ann");
  await shot(page, "edit-before-start", info.project.name);
  await page.getByTestId("setup-seat-1-remove").click();
  await expect(page.getByTestId("setup-seat-3")).toHaveCount(0);
  await expect(page.getByTestId("setup-seat-1-name")).toHaveValue("Cid");
  await page.getByTestId("setup-start-game").click();
  await onBoard(page);
  const g = await game(page);
  expect(g.seats.map((s) => s.name)).toEqual(["Ann", "Cid", "Dee"]);
  // Cid's extra time followed him to seat 2.
  expect(g.timer.config.seatExtraMs).toEqual({ s2: 120_000 });
  expect(g.startOverrides).toEqual({ "mtg.life": 60 });

  const snack = page.getByTestId("snackbar").filter({ hasText: "Update the preset" });
  await expect(snack).toBeVisible();
  await snack.getByTestId("snackbar-action").click();
  await expect
    .poll(async () => (await idbAll<StoredSetupRow>(page, "setups"))[0]?.seats.length)
    .toBe(3);
  const [row] = await idbAll<StoredSetupRow>(page, "setups");
  expect(row!.seats.map((s) => s.name)).toEqual(["Ann", "Cid", "Dee"]);
  expect(row!.name).toBe("Friday pod");
});

test("unchanged Edit before starting offers no update; a missing deck falls back", async ({
  page,
}) => {
  await page.goto("/");
  await seedPod(page);
  // Dee's deck was deleted since the preset was saved.
  await idbDelete(page, "decks", "d-dee");
  await idbPut(page, "setups", [setupRow("pod", "Friday pod", 0)]);
  await page.reload();
  await page.getByTestId("setup-tile-0-edit").click();
  await expect(page.getByTestId("setup-seat-3-name")).toHaveValue("Dee");
  await expect(page.getByTestId("setup-seat-3-commander-0")).toHaveValue("Commander Dee");
  await page.getByTestId("setup-start-game").click();
  await onBoard(page);
  const g = await game(page);
  expect(g.seats[3]).toMatchObject({ name: "Dee" });
  expect(g.seats[3]!.deckId).toBeUndefined();
  await page.waitForTimeout(500);
  await expect(page.getByTestId("snackbar").filter({ hasText: "Update the preset" })).toHaveCount(
    0,
  );
});

test("save from the game menu; a game started from a preset offers Update", async ({
  page,
}, info) => {
  await page.goto("/play?quick=mtg.commander&players=4&names=Ann,Ben,Cid,Dee");
  await onBoard(page);
  await openMenu(page);
  await expect(page.getByTestId("center-menu-save-preset")).toBeVisible();
  await shot(page, "game-menu", info.project.name);
  await page.getByTestId("center-menu-save-preset").click();
  const sheet = page.getByTestId("setup-save-sheet");
  await expect(sheet).toBeVisible();
  await expect(page.getByTestId("setup-save-name")).toHaveValue("Ann, Ben, Cid, Dee · Commander");
  await expect(page.getByTestId("setup-save-update")).toHaveCount(0);
  await expectNoSeriousA11yViolations(page);
  await shot(page, "save-sheet-game", info.project.name);
  await page.getByTestId("setup-save-new").click();
  await expect(sheet).toHaveCount(0);
  await expect(page.getByTestId("center-menu-panel")).toHaveCount(0);
  await expect.poll(async () => (await idbAll(page, "setups")).length).toBe(1);

  await page.goto("/");
  await page.getByTestId("setup-tile-0-start").click();
  await onBoard(page);
  await menuTap(page, "center-menu-save-preset");
  await expect(page.getByTestId("setup-save-update")).toHaveText(
    "Update “Ann, Ben, Cid, Dee · Commander”",
  );
  await page.getByTestId("setup-save-name").fill("Weekly");
  await page.getByTestId("setup-save-update").click();
  await expect
    .poll(async () => (await idbAll<StoredSetupRow>(page, "setups")).map((s) => s.name))
    .toEqual(["Weekly"]);
});

test.describe("paywall enabled (pw=1, free user)", () => {
  test("a second preset opens the paywall from Setup and from the game menu", async ({ page }) => {
    await page.goto("/setup?pw=1");
    await page.waitForFunction(() => window.__tcgPay?.state().policy === "TIERED");
    await idbPut(page, "setups", [setupRow("one", "One", 0)]);
    for (let i = 0; i < 3; i++) await page.getByTestId("setup-next").click();
    await page.getByTestId("setup-save-preset").click();
    const paywall = page.getByTestId("paywall");
    await expect(paywall).toBeVisible();
    await expect(paywall.locator("[data-feature]")).toHaveAttribute(
      "data-feature",
      "savedSetupsUnlimited",
    );
    await expect(page.getByTestId("paywall-row-savedSetups")).toHaveAttribute(
      "data-highlight",
      "1",
    );
    await expect(page.getByTestId("setup-save-sheet")).toHaveCount(0);
    await page.getByTestId("paywall-close").click();
    await expect(page.getByTestId("paywall")).toHaveCount(0);
    // Closing an overlay steps history back; let that settle before navigating.
    await page.waitForTimeout(300);

    await page.goto("/play?quick=mtg.commander&players=2");
    await onBoard(page);
    await menuTap(page, "center-menu-save-preset");
    await page.getByTestId("setup-save-new").click();
    await expect(page.getByTestId("paywall")).toBeVisible();
    expect(await idbAll(page, "setups")).toHaveLength(1);
  });

  test("Pro (pw=pro) saves more than one", async ({ page }) => {
    await page.goto("/setup?pw=pro");
    await page.waitForFunction(() => window.__tcgPay?.state().pro === true);
    await idbPut(page, "setups", [setupRow("one", "One", 0)]);
    for (let i = 0; i < 3; i++) await page.getByTestId("setup-next").click();
    await page.getByTestId("setup-save-preset").click();
    await page.getByTestId("setup-save-new").click();
    await expect.poll(async () => (await idbAll(page, "setups")).length).toBe(2);
  });
});

test("rename, reorder and delete presets; a missing game type offers delete", async ({
  page,
}, info) => {
  await page.goto("/");
  await idbPut(page, "setups", [
    setupRow("a", "Friday pod", 0),
    setupRow("b", "Duel night", 1, {
      seats: POD.slice(0, 2).map((p) => ({ name: p.name, color: p.color, commanders: [] })),
    }),
    setupRow("c", "Old house rules", 2, { presetId: "custom.gone" }),
  ]);
  await page.reload();
  await expect(page.getByTestId("setup-tile-2")).toHaveAttribute("data-missing", "true");
  await expect(page.getByTestId("setup-tile-2-missing")).toHaveText("Game type missing");
  await expect(page.getByTestId("setup-tile-2-start")).toBeDisabled();

  // Rename
  await page.getByTestId("setup-tile-1-more").click();
  await expect(page.getByTestId("setup-manage")).toBeVisible();
  await expectNoSeriousA11yViolations(page);
  await shot(page, "manage-sheet", info.project.name);
  await page.getByTestId("setup-manage-rename").click();
  await page.getByTestId("setup-rename-input").fill("Tuesday duel");
  await page.getByTestId("setup-rename-save").click();
  await expect(page.getByTestId("setup-tile-1-name")).toHaveText("Tuesday duel");

  // Move up
  await page.getByTestId("setup-tile-1-more").click();
  await page.getByTestId("setup-manage-up").click();
  await expect(page.getByTestId("setup-tile-0-name")).toHaveText("Tuesday duel");
  await expect(page.getByTestId("setup-manage-up")).toBeDisabled();
  await page.getByTestId("setup-manage-close").click();

  // Delete the one whose game type is gone, straight from its tile.
  await page.getByTestId("setup-tile-2-delete").click();
  await page.getByTestId("setup-delete-confirm").click();
  await expect(page.getByTestId("setup-tile-2")).toHaveCount(0);

  // Delete from the overflow menu.
  await page.getByTestId("setup-tile-0-more").click();
  await page.getByTestId("setup-manage-delete").click();
  await page.getByTestId("setup-delete-confirm").click();
  await expect(page.getByTestId("setup-tile-1")).toHaveCount(0);
  await expect(page.getByTestId("setup-tile-0-name")).toHaveText("Friday pod");
  const rows = await idbAll<StoredSetupRow>(page, "setups");
  expect(rows.map((r) => r.id)).toEqual(["a"]);
});

test("no presets: the launcher shows the hint once, then nothing", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByTestId("launcher-presets-hint")).toBeVisible();
  await expect(page.getByTestId("launcher-presets")).toHaveCount(0);
  await page.reload();
  await expect(page.getByTestId("launcher-new")).toBeVisible();
  await page.waitForTimeout(300);
  await expect(page.getByTestId("launcher-presets-hint")).toHaveCount(0);
});

test("terminology: no 'custom preset' wording on settings, the builder, the picker and /pro", async ({
  page,
}) => {
  for (const path of ["/settings", "/builder", "/setup", "/pro"]) {
    await page.goto(path);
    await page.waitForLoadState("networkidle");
    const text = (await page.locator("body").innerText()).toLowerCase();
    expect(text, path).not.toContain("custom preset");
    expect(text, path).not.toContain("my presets");
    expect(text, path).not.toContain("game preset");
  }
  await page.goto("/builder");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Custom game types");
  await page.goto("/pro");
  await expect(page.getByTestId("paywall-row-presets")).toContainText("Custom game types");
  await expect(page.getByTestId("paywall-row-savedSetups")).toContainText("Presets");
});

test("screenshots at 360×740", async ({ page }, info) => {
  test.skip(info.project.name !== "pixel7", "one phone size is enough");
  await page.setViewportSize({ width: 360, height: 740 });
  await page.goto("/");
  await seedPod(page);
  await idbPut(page, "setups", [
    setupRow("a", "Friday pod", 0),
    setupRow("b", "Duel night", 1, {
      seats: POD.slice(0, 2).map((p) => ({ name: p.name, color: p.color, commanders: [] })),
    }),
  ]);
  await page.reload();
  await expect(page.getByTestId("setup-tile-1")).toBeVisible();
  await shot(page, "launcher-tiles-360", info.project.name);
  await page.getByTestId("setup-tile-0-edit").click();
  await expect(page.getByTestId("setup-seat-3-name")).toHaveValue("Dee");
  await shot(page, "edit-before-start-360", info.project.name);
  await page.getByTestId("setup-next").click();
  await page.getByTestId("setup-save-preset").scrollIntoViewIfNeeded();
  await shot(page, "setup-footer-360", info.project.name);
  await page.getByTestId("setup-save-preset").click();
  await expect(page.getByTestId("setup-save-update")).toBeVisible();
  await shot(page, "save-sheet-update-360", info.project.name);
});
