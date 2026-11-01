// Preset share links against the emulators (T7.3): user A shares, an anonymous visitor imports,
// and editing the imported copy never affects A's preset or the share.
// @req CUS-007 @req SEC-005 @req A11Y-002
import { expect, test } from "@playwright/test";
import { expectNoSeriousA11yViolations } from "./support/axe";

const FIRESTORE = "http://127.0.0.1:8080/v1/projects/demo-tcg-life/databases/(default)/documents";

async function shareDoc(code: string) {
  const res = await fetch(`${FIRESTORE}/sharedPresets/${code}`, {
    headers: { Authorization: "Bearer owner" },
  });
  if (res.status === 404) return null;
  return (await res.json()) as { fields: Record<string, { stringValue?: string }> };
}

test.describe("share links @emu", () => {
  // @req CUS-007 @req SEC-005
  test("A shares a preset, an anonymous visitor imports an independent copy @emu", async ({
    page,
    browser,
  }, info) => {
    // A (signed out): duplicate Commander as their own preset, then share it.
    await page.goto("/builder");
    await expect(page.getByTestId("builder-empty")).toBeVisible();
    await page.getByTestId("builder-duplicate-open").click();
    await page.getByTestId("builder-dup-mtg.commander").click();
    await expect(page).toHaveURL(/\/builder\/edit\?id=custom\./);
    await page.getByTestId("editor-name").fill("Shared Commander");
    await page.getByTestId("editor-save").click();
    await expect(page.getByTestId("editor-save")).toBeDisabled();
    await page.goto("/builder");
    await expect(page.getByTestId("builder-preset-0-name")).toHaveText("Shared Commander");

    const share = page.getByTestId("builder-share-0");
    await share.click();
    await expect(share).toHaveAttribute("data-url", /\/p\/[A-Za-z0-9]{8}$/, { timeout: 20_000 });
    const url = (await share.getAttribute("data-url"))!;
    const code = url.slice(-8);
    // A got an anonymous uid on demand (AUTH-002); the share is listed as theirs.
    await expect(page.getByTestId(`builder-share-row-${code}`)).toBeVisible({ timeout: 15_000 });
    const stored = await shareDoc(code);
    expect(stored?.fields.name?.stringValue).toBe("Shared Commander");
    expect(stored?.fields.code?.stringValue).toBe(code);
    await expectNoSeriousA11yViolations(page);

    // B: a fresh, signed-out browser context opens the link and imports.
    const ctxB = await browser.newContext({ baseURL: info.project.use.baseURL });
    try {
      const b = await ctxB.newPage();
      await b.goto(`/p/${code}`);
      await expect(b.getByTestId("shared-name")).toHaveText("Shared Commander", {
        timeout: 20_000,
      });
      await expect(b.getByTestId("shared-counters")).toBeVisible();
      await expectNoSeriousA11yViolations(b);
      await b.getByTestId("shared-import").click();
      await expect(b).toHaveURL(/\/builder\/edit\?id=custom\./);
      await expect(b.getByTestId("editor-name")).toHaveValue("Shared Commander");
      await b.getByTestId("editor-name").fill("B's version");
      await b.getByTestId("editor-save").click();
      await expect(b.getByTestId("editor-save")).toBeDisabled();
      await b.goto("/builder");
      await expect(b.getByTestId("builder-preset-0-name")).toHaveText("B's version");
    } finally {
      await ctxB.close();
    }

    // A's preset and the share are untouched.
    expect((await shareDoc(code))?.fields.name?.stringValue).toBe("Shared Commander");
    await page.reload();
    await expect(page.getByTestId("builder-preset-0-name")).toHaveText("Shared Commander");

    // The owner deletes the share; the link stops working.
    await page.getByTestId(`builder-share-delete-${code}`).click();
    await expect(page.getByTestId(`builder-share-row-${code}`)).toHaveCount(0);
    await expect.poll(() => shareDoc(code)).toBeNull();
    await page.goto(`/p/${code}`);
    await expect(page.getByTestId("shared-not-found")).toBeVisible({ timeout: 20_000 });
  });

  test("an unknown code shows not-found @emu", async ({ page }) => {
    await page.goto("/p/ZZZZZZZZ");
    await expect(page.getByTestId("shared-not-found")).toBeVisible({ timeout: 20_000 });
    await page.goto("/p/bad-code");
    await expect(page.getByTestId("shared-not-found")).toBeVisible();
  });
});
