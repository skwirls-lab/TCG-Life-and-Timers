// @req PRE-002 @req CUS-001 @req CUS-006 @req CUS-007
import { readFile } from "node:fs/promises";
import { expect, test } from "@playwright/test";
import { expectNoSeriousA11yViolations } from "./support/axe";

test("duplicate Commander, rename, save, export JSON, import it as a new preset", async ({
  page,
}) => {
  await page.goto("/builder");
  await expect(page.getByTestId("builder-empty")).toBeVisible();

  await page.getByTestId("builder-duplicate-open").click();
  await expect(page.getByTestId("builder-duplicate-sheet")).toBeVisible();
  await expectNoSeriousA11yViolations(page);
  await page.getByTestId("builder-dup-mtg.commander").click();

  await expect(page).toHaveURL(/\/builder\/edit\?id=custom\./);
  await expect(page.getByTestId("editor-name")).toHaveValue("Commander (copy)");
  await page.getByTestId("editor-name").fill("My Commander");
  await page.getByTestId("editor-save").click();
  await expect(page.getByTestId("editor-save")).toBeDisabled();

  await page.getByTestId("page-back").click();
  await expect(page).toHaveURL(/\/builder$/);
  await expect(page.getByTestId("builder-preset-0-name")).toHaveText("My Commander");
  const firstId = await page.getByTestId("builder-preset-0").getAttribute("data-preset-id");

  const downloadPromise = page.waitForEvent("download");
  await page.getByTestId("builder-export-0").click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toBe("my-commander.tcg-preset.json");
  const json = await readFile((await download.path())!, "utf8");
  expect(JSON.parse(json).preset.name).toBe("My Commander");

  // Invalid paste first: readable errors, nothing imported.
  await page.getByTestId("builder-import-open").click();
  await page.getByTestId("builder-import-text").fill("{ not json");
  await page.getByTestId("builder-import-submit").click();
  await expect(page.getByTestId("builder-import-errors")).toContainText("not valid JSON");

  await page.getByTestId("builder-import-text").fill(json);
  await page.getByTestId("builder-import-submit").click();
  await expect(page.getByTestId("builder-import-sheet")).toBeHidden();
  await expect(page.getByTestId("builder-presets").locator("> li")).toHaveCount(2);
  const ids = await page
    .getByTestId("builder-presets")
    .locator("> li")
    .evaluateAll((els) => els.map((e) => e.getAttribute("data-preset-id")));
  expect(new Set(ids).size).toBe(2);
  expect(ids).toContain(firstId);
  await expect(page.getByTestId("builder-preset-0-name")).toHaveText("My Commander");
  await expect(page.getByTestId("builder-preset-1-name")).toHaveText("My Commander");

  // The import also works from a file.
  await page.getByTestId("builder-import-open").click();
  await page.getByTestId("builder-import-file").setInputFiles({
    name: "preset.json",
    mimeType: "application/json",
    buffer: Buffer.from(json),
  });
  await expect(page.getByTestId("builder-import-sheet")).toBeHidden();
  await expect(page.getByTestId("builder-presets").locator("> li")).toHaveCount(3);

  // Delete one.
  await page.getByTestId("builder-delete-2").click();
  await page.getByTestId("builder-delete-confirm").click();
  await expect(page.getByTestId("builder-presets").locator("> li")).toHaveCount(2);
});
