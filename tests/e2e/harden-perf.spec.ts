// T8.1 performance: tap latency and idle CPU on the board.
// @req PERF-002 @req PERF-004
import { expect, test } from "@playwright/test";

const QUICK = "/play?quick=mtg.commander&players=4&seed=7";

declare global {
  interface Window {
    __perf?: {
      active: () => number;
      created: () => { id: number; ms: number; stack: string }[];
      rafCalls: () => number;
    };
  }
}

/** Instrument timers before any app code runs (registry of live intervals + rAF call count). */
async function instrumentTimers(page: import("@playwright/test").Page) {
  await page.addInitScript(() => {
    const live = new Map<number, { id: number; ms: number; stack: string }>();
    const all: { id: number; ms: number; stack: string }[] = [];
    let raf = 0;
    const si = window.setInterval.bind(window);
    const ci = window.clearInterval.bind(window);
    const ra = window.requestAnimationFrame.bind(window);
    window.setInterval = ((fn: TimerHandler, ms?: number, ...args: unknown[]) => {
      const id = si(fn, ms, ...args);
      const rec = { id, ms: ms ?? 0, stack: (new Error().stack ?? "").split("\n")[2] ?? "" };
      live.set(id, rec);
      all.push(rec);
      return id;
    }) as typeof window.setInterval;
    window.clearInterval = ((id?: number) => {
      if (id !== undefined) live.delete(id);
      ci(id);
    }) as typeof window.clearInterval;
    window.requestAnimationFrame = (cb: FrameRequestCallback) => {
      raf += 1;
      return ra(cb);
    };
    window.__perf = { active: () => live.size, created: () => all, rafCalls: () => raf };
  });
}

test("a tap updates the number in under 50 ms (median of 20)", async ({ page }) => {
  await page.goto(QUICK);
  await expect(page.getByTestId("seat-0-value")).toBeVisible();
  await page.evaluate(() => {
    const w = window as unknown as { __lat: number[]; __t0: number | null };
    w.__lat = [];
    w.__t0 = null;
    const plus = document.querySelector('[data-testid="seat-0-plus"]')!;
    const tile = document.querySelector('[data-testid="seat-0"]')!;
    const read = () => document.querySelector('[data-testid="seat-0-value"]')?.textContent;
    let last = read();
    plus.addEventListener("pointerdown", () => (w.__t0 = performance.now()), { capture: true });
    new MutationObserver(() => {
      const v = read();
      if (v !== last && w.__t0 !== null) {
        w.__lat.push(performance.now() - w.__t0);
        w.__t0 = null;
      }
      last = v;
    }).observe(tile, { subtree: true, childList: true, characterData: true });
  });
  const start = Number(await page.getByTestId("seat-0-value").textContent());
  for (let i = 0; i < 20; i++) {
    await page.getByTestId("seat-0-plus").click();
    await expect(page.getByTestId("seat-0-value")).toHaveText(String(start + i + 1));
  }
  const lat = await page.evaluate(() => (window as unknown as { __lat: number[] }).__lat);
  expect(lat).toHaveLength(20);
  const sorted = [...lat].sort((a, b) => a - b);
  const median = (sorted[9]! + sorted[10]!) / 2;
  console.log(
    `[PERF-002] tap→DOM latency ms: median ${median.toFixed(1)}, p90 ${sorted[17]!.toFixed(1)}, ` +
      `max ${sorted[19]!.toFixed(1)}; samples ${lat.map((x) => x.toFixed(1)).join(", ")}`,
  );
  expect(median).toBeLessThanOrEqual(50);
});

test("no intervals or animation loops run on an idle board with clocks off", async ({ page }) => {
  await instrumentTimers(page);
  await page.goto(QUICK);
  await expect(page.getByTestId("seat-0-value")).toBeVisible();
  // One tap, then let the pending bubble and any transitions settle (bubble fades after 2 s).
  await page.getByTestId("seat-0-plus").click();
  await page.waitForFunction(() => !document.querySelector('[data-testid="seat-0-bubble"]'), null, {
    timeout: 8000,
  });
  await expect
    .poll(async () => page.evaluate(() => window.__perf!.active()), { timeout: 5000 })
    .toBe(0);
  const raf0 = await page.evaluate(() => window.__perf!.rafCalls());
  await page.waitForTimeout(250);
  await page.waitForTimeout(250);
  await page.waitForTimeout(250);
  await page.waitForTimeout(250);
  const after = await page.evaluate(() => ({
    active: window.__perf!.active(),
    raf: window.__perf!.rafCalls(),
    created: window.__perf!.created(),
  }));
  console.log(
    `[PERF-004] idle board: ${after.active} live intervals, ${after.raf - raf0} rAF calls in 1 s; ` +
      `intervals created since load: ${JSON.stringify(after.created)}`,
  );
  expect(after.active).toBe(0);
  // A rAF loop would be ~60 calls/s; allow a couple of one-off frames (e.g. a fade ending).
  expect(after.raf - raf0).toBeLessThanOrEqual(2);
});
