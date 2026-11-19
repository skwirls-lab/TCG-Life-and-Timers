// Mobile shell basics (owner feedback): pull-to-refresh works outside the game, the installed
// app keeps the phone's status and navigation bars, and the installed app has its own pull.
import { expect, test } from "@playwright/test";

const overscroll = () => getComputedStyle(document.documentElement).overscrollBehaviorY;

test("pull-to-refresh is only switched off on the game board", async ({ page }) => {
  await page.goto("/settings");
  await expect(page.getByTestId("page-back")).toBeVisible();
  expect(await page.evaluate(overscroll)).not.toBe("none");
  await page.goto("/play?quick=mtg.commander&players=2&names=A,B");
  await expect(page.getByTestId("seat-0-name")).toHaveText("A");
  expect(await page.evaluate(overscroll)).toBe("none");
});

test("the installed app opens as a normal app, not fullscreen", async ({ request }) => {
  const res = await request.get("/manifest.webmanifest");
  const manifest = (await res.json()) as { display: string; display_override?: string[] };
  expect(manifest.display).toBe("standalone");
  expect(manifest.display_override ?? []).not.toContain("fullscreen");
});

test("installed app: pulling down from the top shows the refresh indicator", async ({
  page,
}, info) => {
  test.skip(info.project.name !== "pixel7", "touch emulation on the Android project");
  await page.addInitScript(() => {
    const real = window.matchMedia.bind(window);
    window.matchMedia = (q: string) =>
      q.includes("display-mode: standalone")
        ? ({ ...real(q), matches: true, media: q } as MediaQueryList)
        : real(q);
  });
  await page.goto("/settings");
  await expect(page.getByTestId("page-back")).toBeVisible();
  const cdp = await page.context().newCDPSession(page);
  const touch = (type: "touchStart" | "touchMove" | "touchEnd", y: number) =>
    cdp.send("Input.dispatchTouchEvent", {
      type,
      touchPoints: type === "touchEnd" ? [] : [{ x: 180, y, id: 1 }],
    });
  await touch("touchStart", 120);
  for (let y = 140; y <= 320; y += 30) await touch("touchMove", y);
  await expect(page.getByTestId("pull-refresh")).toHaveAttribute("data-ready", "true");
  const reloaded = page.waitForEvent("load");
  await touch("touchEnd", 320);
  await reloaded;
  await expect(page.getByTestId("pull-refresh")).toHaveCount(0);
});
