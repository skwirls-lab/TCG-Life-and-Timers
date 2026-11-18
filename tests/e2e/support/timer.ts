import { expect, type Page } from "@playwright/test";

/** Fixed fake start time for timer specs (page.clock). */
export const T0 = new Date("2026-03-01T18:00:00Z").getTime();

export const NAMES = "Conner,Josh,JP,Bethany";

/**
 * Quick-start /play with a fake clock (installed BEFORE navigation), then pause the clock so time
 * only moves with `page.clock.runFor` (deterministic assertions).
 */
export async function gotoClockBoard(page: Page, params: string, players = 4) {
  await page.clock.install({ time: T0 });
  await page.goto(
    `/play?quick=mtg.commander&players=${players}&seed=7&names=${NAMES}&s.hideSystemBars=0&${params}`,
  );
  await expect(page.getByTestId("seat-0")).toBeVisible();
  await page.clock.pauseAt(T0 + 60_000);
}

export interface TimerSnapshot {
  status: string;
  holder: string | null;
  stack: string[];
  active: number;
  seatIds: string[];
  pausedReason: string | null;
  /** Remaining bank per seat index, projected to the page's Date.now(). */
  remaining: number[];
  states: string[];
  eliminated: boolean[];
}

/** Engine timer state as seen by the page (bank projected to the page's fake now). */
export async function timerState(page: Page): Promise<TimerSnapshot> {
  return page.evaluate(() => {
    const g = window.__tcg!.getState().session!.game;
    const t = g.timer;
    const now = Date.now();
    const charging =
      t.status === "running" &&
      t.runningSince !== null &&
      !(t.config.responses === "freeze" && t.responseStack.length > 0) &&
      // An open declare-blockers window (nobody responding) stops the attacker's clock.
      !(t.blockers && t.responseStack.length === 0);
    return {
      status: t.status,
      holder: t.holder,
      stack: [...t.responseStack],
      active: g.seats.findIndex((s) => s.id === g.turn.activeSeat),
      seatIds: g.seats.map((s) => s.id),
      pausedReason: t.pausedReason ?? null,
      remaining: g.seats.map((s) => {
        const c = t.clocks[s.id]!;
        const running = charging && t.holder === s.id ? now - t.runningSince! : 0;
        return c.bankMs - running;
      }),
      states: g.seats.map((s) => t.clocks[s.id]!.state),
      eliminated: g.seats.map((s) => s.eliminated),
    };
  });
}

/** Seat index whose turn it is. */
export async function activeIndex(page: Page): Promise<number> {
  return (await timerState(page)).active;
}

/** The game stored in IndexedDB (to wait for autosave before a reload). */
export async function storedTimer(
  page: Page,
): Promise<{ status: string; runningSince: number | null } | null> {
  return page.evaluate(
    () =>
      new Promise<{ status: string; runningSince: number | null } | null>((resolve) => {
        const req = indexedDB.open("tcg-life");
        req.onerror = () => resolve(null);
        req.onsuccess = () => {
          const db = req.result;
          try {
            const tx = db.transaction(["kv", "games"], "readonly");
            const ptr = tx.objectStore("kv").get("activeGameId");
            ptr.onsuccess = () => {
              const id = (ptr.result as { value?: string } | undefined)?.value;
              if (!id) return resolve(null);
              const row = tx.objectStore("games").get(id);
              row.onsuccess = () => {
                const timer = (
                  row.result as
                    | { game?: { timer?: { status: string; runningSince: number | null } } }
                    | undefined
                )?.game?.timer;
                resolve(timer ? { status: timer.status, runningSince: timer.runningSince } : null);
              };
            };
          } catch {
            resolve(null);
          } finally {
            db.close();
          }
        };
      }),
  );
}

/** Simulate the app going to the background and back (visibilitychange). */
export async function setHidden(page: Page, hidden: boolean) {
  await page.evaluate((h) => {
    Object.defineProperty(document, "visibilityState", {
      configurable: true,
      get: () => (h ? "hidden" : "visible"),
    });
    Object.defineProperty(document, "hidden", { configurable: true, get: () => h });
    document.dispatchEvent(new Event("visibilitychange"));
  }, hidden);
}

/** m:ss text for a remaining time (truncated, as the chip shows it). */
export function mss(ms: number): string {
  const s = Math.floor(ms / 1000);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}
