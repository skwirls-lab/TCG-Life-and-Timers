/**
 * Scryfall interception for the ART e2e specs (the sandbox blocks api.scryfall.com and
 * cards.scryfall.io): API calls are answered from tests/fixtures/scryfall, card images with a
 * tiny generated JPEG. Routes are registered on the browser context so service worker requests
 * are intercepted too.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import type { BrowserContext, Page } from "@playwright/test";
import sharp from "sharp";

const FIX = path.join(__dirname, "..", "..", "fixtures", "scryfall");
const fixture = (name: string) => readFileSync(path.join(FIX, name), "utf8");

let jpeg: Promise<Buffer> | null = null;
/** 488×360 (an art_crop-like aspect) two-tone JPEG. */
export function artJpeg(): Promise<Buffer> {
  jpeg ??= sharp({
    create: { width: 488, height: 360, channels: 3, background: { r: 180, g: 60, b: 40 } },
  })
    .composite([
      {
        input: {
          create: {
            width: 244,
            height: 360,
            channels: 3,
            background: { r: 30, g: 90, b: 200 },
          },
        },
        left: 244,
        top: 0,
      },
    ])
    .jpeg({ quality: 80 })
    .toBuffer();
  return jpeg;
}

export interface ScryfallLog {
  api: string[];
  images: string[];
}

const catalog = (data: string[]) =>
  JSON.stringify({ object: "catalog", total_values: data.length, data });

function apiBody(url: URL): { status: number; body: string } {
  const p = url.pathname;
  if (p === "/cards/autocomplete") {
    const q = (url.searchParams.get("q") ?? "").toLowerCase();
    if (q.startsWith("sol")) return { status: 200, body: fixture("autocomplete-sol.json") };
    if (q.startsWith("atr")) return { status: 200, body: fixture("autocomplete-atraxa.json") };
    if (q.startsWith("del"))
      return { status: 200, body: catalog(["Delver of Secrets // Insectile Aberration"]) };
    if (q.startsWith("aga"))
      return { status: 200, body: catalog(["Agadeem's Awakening // Agadeem, the Undercrypt"]) };
    return { status: 200, body: catalog([]) };
  }
  if (p === "/cards/search") {
    const q = url.searchParams.get("q") ?? "";
    if (q.includes("Sol Ring"))
      return {
        status: 200,
        body: fixture(
          url.searchParams.get("page") === "2"
            ? "search-sol-ring-page2.json"
            : "search-sol-ring-page1.json",
        ),
      };
    if (q.includes("Delver")) return { status: 200, body: fixture("search-delver-transform.json") };
    if (q.includes("Agadeem")) return { status: 200, body: fixture("search-modal-dfc.json") };
    return { status: 404, body: fixture("error-404-search.json") };
  }
  if (p === "/cards/named") {
    if ((url.searchParams.get("exact") ?? "").toLowerCase() === "sol ring")
      return { status: 200, body: fixture("named-sol-ring.json") };
    return { status: 404, body: fixture("error-404-named.json") };
  }
  return { status: 404, body: fixture("error-404-named.json") };
}

/** Intercept Scryfall API + image hosts on the context; returns a request log. */
export async function routeScryfall(target: BrowserContext | Page): Promise<ScryfallLog> {
  const log: ScryfallLog = { api: [], images: [] };
  const img = await artJpeg();
  await target.route("https://api.scryfall.com/**", async (route) => {
    const url = new URL(route.request().url());
    log.api.push(url.pathname + url.search);
    const { status, body } = apiBody(url);
    await route.fulfill({
      status,
      body,
      contentType: "application/json",
      headers: { "access-control-allow-origin": "*" },
    });
  });
  await target.route("https://cards.scryfall.io/**", async (route) => {
    log.images.push(route.request().url());
    await route.fulfill({
      status: 200,
      body: img,
      contentType: "image/jpeg",
      headers: { "access-control-allow-origin": "*", "cache-control": "max-age=86400" },
    });
  });
  return log;
}

/** All rows of the app's Dexie `art` table, with blob bytes (read through raw IndexedDB). */
export async function readArtRows(page: Page) {
  return page.evaluate(async () => {
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const req = indexedDB.open("tcg-life");
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
    const rows = await new Promise<{ id: string; blob: Blob; meta: Record<string, unknown> }[]>(
      (resolve, reject) => {
        const req = db.transaction("art", "readonly").objectStore("art").getAll();
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
      },
    );
    db.close();
    const out = [];
    for (const r of rows)
      out.push({
        id: r.id,
        meta: r.meta,
        type: r.blob.type,
        bytes: Array.from(new Uint8Array(await r.blob.arrayBuffer())),
      });
    return out;
  });
}
