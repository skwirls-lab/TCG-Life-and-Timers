// Account, sync status, export, feedback and diagnostics against the emulators (T4.1, T4.5, T4.7).
// @req AUTH-001 @req AUTH-003 @req AUTH-004 @req AUTH-006 @req SYNC-004 @req SET-041 @req SET-042 @req A11Y-002
import { expect, test, type Page } from "@playwright/test";
import { readFile } from "node:fs/promises";
import { expectNoSeriousA11yViolations } from "./support/axe";
import { HARNESS } from "./support/seatHarness";

const FIRESTORE = "http://127.0.0.1:8080/v1/projects/demo-tcg-life/databases/(default)/documents";

async function authHooks(page: Page) {
  await page.waitForFunction(() => window.__tcgAuth !== undefined);
}

function uniqueEmail(label: string, project: string) {
  return `${label}-${project}-${Date.now()}@example.com`;
}

interface FsValue {
  stringValue?: string;
}
interface FsDoc {
  name: string;
  fields: Record<string, FsValue>;
}

/** Profile names in the cloud for `uid` (live ones only), read with emulator owner access. */
async function cloudProfiles(uid: string): Promise<string[]> {
  const res = await fetch(`${FIRESTORE}/users/${uid}/profiles`, {
    headers: { Authorization: "Bearer owner" },
  });
  const body = (await res.json()) as {
    documents?: { fields: Record<string, { stringValue?: string; booleanValue?: boolean }> }[];
  };
  return (body.documents ?? [])
    .filter((d) => d.fields.deleted?.booleanValue !== true)
    .map((d) => d.fields.name?.stringValue ?? "")
    .sort();
}

async function feedbackDocs(): Promise<FsDoc[]> {
  const res = await fetch(`${FIRESTORE}/feedback?pageSize=300`, {
    headers: { Authorization: "Bearer owner" },
  });
  expect(res.ok).toBe(true);
  const body = (await res.json()) as { documents?: FsDoc[] };
  return body.documents ?? [];
}

test.describe("account @emu", () => {
  // @req AUTH-001 @req AUTH-004 @req SYNC-004
  test("sign in → account shows email and sync status → sign out @emu", async ({ page }, info) => {
    await page.goto("/account");
    await expect(page.getByTestId("account-page")).toBeVisible();
    await expect(page.getByTestId("account-signin")).toBeEnabled();
    await expectNoSeriousA11yViolations(page);

    const email = uniqueEmail("signin", info.project.name);
    await authHooks(page);
    await page.evaluate((e) => window.__tcgAuth!.signInForTests(e), email);
    await expect(page.getByTestId("account-email")).toContainText(email);
    await expect(page.getByTestId("account-sync-status")).toContainText("Synced", {
      timeout: 15_000,
    });
    await expectNoSeriousA11yViolations(page);

    await page.getByTestId("account-signout").click();
    await expect(page.getByTestId("account-signout-panel")).toBeVisible();
    await expectNoSeriousA11yViolations(page);
    await page.getByTestId("account-signout-remove").check();
    await page.getByTestId("account-signout-confirm").click();
    await expect(page.getByTestId("account-signin")).toBeVisible();
    expect(await page.evaluate(() => window.__tcgAuth!.auth().user)).toBeNull();
  });

  // @req AUTH-003
  test("guest data merges into an account that already has cloud data @emu", async ({
    page,
  }, info) => {
    const email = uniqueEmail("merge", info.project.name);
    const addProfile = async (name: string) => {
      await page.goto("/profiles");
      await page.getByTestId("profile-new").click();
      await page.getByTestId("profile-name-input").fill(name);
      await page.getByTestId("profile-save").click();
      await expect(page.getByTestId("deck-new")).toBeVisible();
    };
    const signIn = async () => {
      await page.goto("/account");
      await authHooks(page);
      await page.evaluate((e) => window.__tcgAuth!.signInForTests(e), email);
      await expect(page.getByTestId("account-email")).toContainText(email);
    };

    // 1. A guest profile goes to the (empty) cloud on first sign-in, then leaves the device.
    await addProfile("Cloud Carl");
    await signIn();
    await expect(page.getByTestId("account-sync-status")).toContainText("Synced", {
      timeout: 15_000,
    });
    const uid = await page.evaluate(() => window.__tcgAuth!.auth().user!.uid);
    expect(await cloudProfiles(uid)).toEqual(["Cloud Carl"]);
    await page.getByTestId("account-signout").click();
    await page.getByTestId("account-signout-remove").check();
    await page.getByTestId("account-signout-confirm").click();
    await expect(page.getByTestId("account-signin")).toBeVisible();
    expect(await cloudProfiles(uid)).toEqual(["Cloud Carl"]); // clearing the device ≠ deleting

    // 2. New guest data, then sign in again: both sides have data → Merge / Keep cloud only.
    await addProfile("Local Lou");
    await signIn();
    await expect(page.getByTestId("account-merge")).toBeVisible({ timeout: 15_000 });
    await expectNoSeriousA11yViolations(page);
    await page.getByTestId("account-merge-merge").click();
    await expect(page.getByTestId("account-merge")).toHaveCount(0);
    await expect(page.getByTestId("account-sync-status")).toContainText("Synced", {
      timeout: 15_000,
    });

    // 3. No data loss: both profiles are in the cloud and on the device.
    await expect.poll(() => cloudProfiles(uid)).toEqual(["Cloud Carl", "Local Lou"]);
    await page.goto("/profiles");
    await expect(page.getByTestId("profiles-page")).toContainText("Cloud Carl");
    await expect(page.getByTestId("profiles-page")).toContainText("Local Lou");
  });

  // @req AUTH-006
  test("export downloads a JSON file of local data @emu", async ({ page }) => {
    await page.goto("/profiles");
    await page.getByTestId("profile-new").click();
    await page.getByTestId("profile-name-input").fill("Exporter");
    await page.getByTestId("profile-save").click();
    await expect(page.getByTestId("deck-new")).toBeVisible();

    await page.goto("/account");
    const [download] = await Promise.all([
      page.waitForEvent("download"),
      page.getByTestId("account-export").click(),
    ]);
    expect(download.suggestedFilename()).toMatch(/^tcgtempo-export-\d{4}-\d{2}-\d{2}\.json$/);
    const json = JSON.parse(await readFile((await download.path())!, "utf8")) as {
      format: string;
      profiles: { name: string }[];
    };
    expect(json.format).toBe("tcg-life-export");
    expect(json.profiles.map((p) => p.name)).toContain("Exporter");
  });

  // @req SET-041
  test("feedback submit writes a feedback document @emu", async ({ page }, info) => {
    await page.goto("/feedback");
    await expect(page.getByTestId("feedback-page")).toBeVisible();
    await expectNoSeriousA11yViolations(page);
    const text = `e2e feedback ${info.project.name} ${Date.now()}`;
    await page.getByTestId("feedback-category-idea").click();
    await page.getByTestId("feedback-text").fill(text);
    await page.getByTestId("feedback-email").fill("tester@example.com");
    await page.getByTestId("feedback-send").click();
    await expect(page.getByTestId("feedback-status")).toContainText("Thanks", { timeout: 15_000 });
    const doc = (await feedbackDocs()).find((d) => d.fields.text?.stringValue === text);
    expect(doc).toBeDefined();
    expect(doc!.fields.category?.stringValue).toBe("idea");
    expect(doc!.fields.email?.stringValue).toBe("tester@example.com");
    expect(doc!.fields.uid?.stringValue).toBeTruthy(); // lazily created anonymous user
  });

  // @req SET-042
  test("diagnostics exclude player names unless ticked @emu", async ({ page }, info) => {
    await page.goto(HARNESS);
    await expect(page.getByTestId("seat-harness")).toBeVisible();
    // Wait for autosave so /feedback can read the active game.
    await expect
      .poll(() =>
        page.evaluate(
          () =>
            new Promise<boolean>((resolve) => {
              const req = indexedDB.open("tcg-life");
              req.onsuccess = () => {
                const db = req.result;
                const done = (v: boolean) => {
                  db.close(); // never block Dexie's own open/upgrade
                  resolve(v);
                };
                if (!db.objectStoreNames.contains("kv")) return done(false);
                const get = db.transaction("kv").objectStore("kv").get("activeGameId");
                get.onsuccess = () => done(get.result !== undefined);
                get.onerror = () => done(false);
              };
              req.onerror = () => resolve(false);
            }),
        ),
      )
      .toBe(true);

    await page.goto("/feedback");
    await page.getByTestId("feedback-diagnostics").check();
    const preview = page.getByTestId("feedback-diagnostics-preview");
    await expect(preview).toContainText('"activePresetId": "mtg.commander"');
    await expect(preview).toContainText("Player 1");
    await expect(preview).not.toContainText("Conner");
    await expectNoSeriousA11yViolations(page);

    await page.getByTestId("feedback-include-names").check();
    await expect(preview).toContainText("Conner");
    await page.getByTestId("feedback-include-names").uncheck();
    await expect(preview).not.toContainText("Conner");

    const text = `diagnostics ${info.project.name} ${Date.now()}`;
    await page.getByTestId("feedback-text").fill(text);
    await page.getByTestId("feedback-send").click();
    await expect(page.getByTestId("feedback-status")).toContainText("Thanks", { timeout: 15_000 });
    const doc = (await feedbackDocs()).find((d) => d.fields.text?.stringValue === text);
    const diagnostics = doc?.fields.diagnostics?.stringValue ?? "";
    expect(diagnostics).toContain("Player 1");
    expect(diagnostics).not.toContain("Conner");
  });
});
