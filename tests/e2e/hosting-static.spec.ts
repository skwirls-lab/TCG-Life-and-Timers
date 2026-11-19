// @req PERF-001 @req ARCH-001
// Firebase Hosting static export (DEPLOY.md Part 3): a client navigation never waits on a server
// render. Its RSC payload is a prebuilt file of the export, served by the Hosting emulator with
// firebase.json's caching headers (scripts/serve-hosting.ts).
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { expect, test } from "@playwright/test";

const EXPORT_DIR = process.env.E2E_SERVER === "emu" ? "out-emu" : "out-test";

// Requests the service worker answers are not visible as network requests; measure the network.
test.use({ serviceWorkers: "block" });

interface Fetched {
  path: string;
  status: number;
  type: string;
  cache: string;
}

test("launcher → Settings is a client navigation that fetches static RSC files", async ({
  page,
}, info) => {
  const rsc: Fetched[] = [];
  const documents: string[] = [];
  page.on("response", async (res) => {
    const req = res.request();
    const url = new URL(res.url());
    if (req.resourceType() === "document") documents.push(url.pathname);
    const headers = await req.allHeaders();
    if (headers["rsc"] !== "1") return;
    rsc.push({
      path: url.pathname + url.search,
      status: res.status(),
      type: res.headers()["content-type"] ?? "",
      cache: res.headers()["cache-control"] ?? "",
    });
  });

  await page.goto("/");
  await expect(page.getByTestId("launcher")).toBeVisible();
  await page.getByTestId("launcher-link-settings").click();
  await expect(page).toHaveURL(/\/settings$/);
  await expect(page.getByTestId("page-back")).toBeVisible();

  // one document load (the launcher); Settings arrived without a page load
  expect(documents).toEqual(["/"]);
  const settings = rsc.filter((r) => r.path.startsWith("/settings"));
  expect(settings.length).toBeGreaterThan(0);
  for (const r of rsc) {
    expect(r.status, r.path).toBe(200);
    expect(r.path, "RSC payloads are .txt files").toMatch(/\.txt(\?|$)/);
    expect(r.type, r.path).toContain("text/plain");
    expect(r.cache, r.path).toBe("no-cache");
    // byte-for-byte a file of the export: nothing rendered it on request
    const file = join(EXPORT_DIR, decodeURIComponent(r.path.split("?")[0]!));
    expect(existsSync(file), file).toBe(true);
    const served = await page.request.get(r.path, { headers: { RSC: "1" } });
    expect(Buffer.compare(await served.body(), readFileSync(file)), file).toBe(0);
  }
  await info.attach("client-navigation-fetches.json", {
    body: JSON.stringify(rsc, null, 2),
    contentType: "application/json",
  });
  console.log(`client navigation / → /settings fetched:\n${JSON.stringify(rsc, null, 2)}`);
});

test("hashed build assets are cached for a year, pages revalidate", async ({ request }) => {
  const html = await request.get("/settings");
  expect(html.headers()["cache-control"]).toBe("no-cache");
  const src = /\/_next\/static\/chunks\/[^"]+\.js/.exec(await html.text())?.[0];
  expect(src).toBeTruthy();
  const chunk = await request.get(src!);
  expect(chunk.status()).toBe(200);
  expect(chunk.headers()["cache-control"]).toBe("public, max-age=31536000, immutable");
  // clean URLs: the .html form redirects to the extension-less URL the app links to
  const legacy = await request.get("/settings.html", { maxRedirects: 0 });
  expect(legacy.status()).toBe(301);
  expect(legacy.headers()["location"]).toBe("/settings");
});

test("share links /p/{code} are served by the one exported share page", async ({ request }) => {
  const res = await request.get("/p/AbCdEfGh");
  expect(res.status()).toBe(200);
  expect(await res.text()).toBe(readFileSync(join(EXPORT_DIR, "p", "_.html"), "utf8"));
  const missing = await request.get("/no-such-page");
  expect(missing.status()).toBe(404);
});
