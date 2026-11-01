/**
 * Refresh tests/fixtures/scryfall/*.json from the live Scryfall API (T5.1).
 *
 *   npx tsx scripts/record-scryfall-fixtures.ts            # write fixtures
 *   npx tsx scripts/record-scryfall-fixtures.ts --dry-run  # fetch and report only
 *
 * The committed fixtures were hand-authored from Scryfall's documented object shapes because
 * the build sandbox cannot reach api.scryfall.com. Their card names are real, but ids, image
 * URLs and some artist/set values are illustrative until this script is run where the network
 * allows. Tests assert relationships (face count, page links, error codes), not exact values,
 * except where they read the expected value from the fixture itself.
 *
 * Etiquette (ART-006): a server-side script may and should send a descriptive User-Agent and
 * an Accept header, and wait ≥ 100 ms between requests.
 *
 * Paging: real `unique=art` searches for one card rarely exceed Scryfall's 175-card page, so the
 * two-page Sol Ring fixture is produced by splitting the live result into a 2-card page 1
 * (with has_more/next_page) and a page 2 holding the third card.
 */
import { writeFileSync } from "node:fs";
import { join } from "node:path";

const API = "https://api.scryfall.com";
const OUT = join(process.cwd(), "tests/fixtures/scryfall");
const DRY = process.argv.includes("--dry-run");
const HEADERS = {
  Accept: "application/json",
  "User-Agent": "TCGLifeAndTimers-fixture-recorder/0.1 (+https://github.com/; dev fixtures)",
};

interface ListLike {
  object: "list";
  has_more: boolean;
  next_page?: string;
  total_cards?: number;
  data: unknown[];
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
let last = 0;

async function get(path: string, okStatuses: number[] = [200]): Promise<unknown> {
  const wait = last + 120 - Date.now();
  if (wait > 0) await sleep(wait);
  last = Date.now();
  const res = await fetch(path.startsWith("http") ? path : API + path, { headers: HEADERS });
  if (!okStatuses.includes(res.status)) {
    throw new Error(`${path}: HTTP ${res.status} ${await res.text()}`);
  }
  return res.json();
}

function write(name: string, body: unknown) {
  const file = join(OUT, `${name}.json`);
  if (DRY) {
    console.log(`[dry-run] ${file} (${JSON.stringify(body).length} bytes)`);
    return;
  }
  writeFileSync(file, JSON.stringify(body, null, 2) + "\n");
  console.log(`wrote ${file}`);
}

function search(name: string) {
  const p = new URLSearchParams({ q: `!"${name}"`, unique: "art", order: "released" });
  return `/cards/search?${p}`;
}

async function main() {
  write("autocomplete-sol", await get("/cards/autocomplete?q=sol"));
  write("autocomplete-atraxa", await get("/cards/autocomplete?q=atraxa"));

  const sol = (await get(search("Sol Ring"))) as ListLike;
  const three = sol.data.slice(0, 3);
  if (three.length < 3) throw new Error("expected ≥ 3 Sol Ring artworks");
  const page2Url = `${API}${search("Sol Ring")}&page=2`;
  write("search-sol-ring-page1", {
    object: "list",
    total_cards: 3,
    has_more: true,
    next_page: page2Url,
    data: three.slice(0, 2),
  });
  write("search-sol-ring-page2", {
    object: "list",
    total_cards: 3,
    has_more: false,
    data: three.slice(2),
  });
  write("named-sol-ring", three[2]);

  const delver = (await get(search("Delver of Secrets"))) as ListLike;
  write("search-delver-transform", { ...delver, data: delver.data.slice(0, 1), has_more: false });
  const mdfc = (await get(search("Agadeem's Awakening"))) as ListLike;
  write("search-modal-dfc", { ...mdfc, data: mdfc.data.slice(0, 1), has_more: false });

  write("error-404-named", await get("/cards/named?exact=Not+A+Real+Card", [404]));
  write("error-404-search", await get(search("Not A Real Card"), [404]));
  // error-429.json stays hand-authored: provoking a real 429 would violate the etiquette.

  write("symbology", await get("/symbology"));
}

main().catch((e: unknown) => {
  console.error(e);
  process.exit(1);
});
