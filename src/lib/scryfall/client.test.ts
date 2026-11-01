// @vitest-environment node
// @req ART-001 @req ART-002 @req ART-003 @req ART-006 @req TOOL-011
import { http, HttpResponse } from "msw";
import { setupServer } from "msw/node";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import autocompleteAtraxa from "../../../tests/fixtures/scryfall/autocomplete-atraxa.json";
import autocompleteSol from "../../../tests/fixtures/scryfall/autocomplete-sol.json";
import error404Named from "../../../tests/fixtures/scryfall/error-404-named.json";
import error404Search from "../../../tests/fixtures/scryfall/error-404-search.json";
import error429 from "../../../tests/fixtures/scryfall/error-429.json";
import namedSolRing from "../../../tests/fixtures/scryfall/named-sol-ring.json";
import searchDelver from "../../../tests/fixtures/scryfall/search-delver-transform.json";
import searchMdfc from "../../../tests/fixtures/scryfall/search-modal-dfc.json";
import solPage1 from "../../../tests/fixtures/scryfall/search-sol-ring-page1.json";
import solPage2 from "../../../tests/fixtures/scryfall/search-sol-ring-page2.json";
import symbologyFixture from "../../../tests/fixtures/scryfall/symbology.json";
import { createMemoryCache, type KeyValueCache } from "./cache";
import {
  DEFAULT_TTL_MS,
  MAX_RETRY_AFTER_MS,
  createScryfallClient,
  parseRetryAfter,
  type ScryfallClientOptions,
} from "./client";
import { ScryfallError } from "./errors";

const API = "https://api.scryfall.com";
const server = setupServer();
const seen: Request[] = [];
server.events.on("request:start", ({ request }) => {
  seen.push(request.clone());
});

beforeAll(() => server.listen({ onUnhandledFrame: "error" }));
afterEach(() => {
  server.resetHandlers();
  seen.length = 0;
  vi.useRealTimers();
});
afterAll(() => server.close());

/** A client that never actually waits (spacing/backoff are tested separately). */
function fastClient(extra: ScryfallClientOptions = {}) {
  return createScryfallClient({ sleep: async () => {}, ...extra });
}

function autocompleteHandler() {
  return http.get(`${API}/cards/autocomplete`, ({ request }) => {
    const q = new URL(request.url).searchParams.get("q");
    if (q === "sol") return HttpResponse.json(autocompleteSol);
    if (q === "atraxa") return HttpResponse.json(autocompleteAtraxa);
    return HttpResponse.json({ object: "catalog", total_values: 0, data: [] });
  });
}

function searchHandler() {
  return http.get(`${API}/cards/search`, ({ request }) => {
    const p = new URL(request.url).searchParams;
    const q = p.get("q");
    if (q === '!"Sol Ring"') return HttpResponse.json(p.get("page") === "2" ? solPage2 : solPage1);
    if (q === '!"Delver of Secrets"') return HttpResponse.json(searchDelver);
    if (q === `!"Agadeem's Awakening"`) return HttpResponse.json(searchMdfc);
    return HttpResponse.json(error404Search, { status: 404 });
  });
}

describe("autocomplete (ART-001)", () => {
  it("returns catalog names for 'sol' and 'atraxa' with Accept: application/json", async () => {
    server.use(autocompleteHandler());
    const client = fastClient();
    expect(await client.autocomplete("sol")).toEqual(autocompleteSol.data);
    expect(await client.autocomplete("  atraxa ")).toEqual(autocompleteAtraxa.data);
    expect(seen).toHaveLength(2);
    expect(seen[0]!.headers.get("accept")).toBe("application/json");
    expect(new URL(seen[1]!.url).searchParams.get("q")).toBe("atraxa");
  });

  it("short-circuits queries shorter than 2 characters without a request", async () => {
    server.use(autocompleteHandler());
    const client = fastClient();
    expect(await client.autocomplete("")).toEqual([]);
    expect(await client.autocomplete("s")).toEqual([]);
    expect(await client.autocomplete("  a  ")).toEqual([]);
    expect(seen).toHaveLength(0);
  });
});

describe("searchArts (ART-002, ART-003)", () => {
  it('queries !"name" with unique=art&order=released and follows next_page', async () => {
    server.use(searchHandler());
    const arts = await fastClient().searchArts("Sol Ring");
    expect(seen).toHaveLength(2);
    const first = new URL(seen[0]!.url).searchParams;
    expect(first.get("q")).toBe('!"Sol Ring"');
    expect(first.get("unique")).toBe("art");
    expect(first.get("order")).toBe("released");
    expect(seen[1]!.url).toBe(solPage1.next_page);

    expect(arts).toHaveLength(3);
    expect(arts.map((a) => a.setCode)).toEqual(["mps", "c13", "lea"]);
    const alpha = arts[2]!;
    const card = solPage2.data[0]!;
    expect(alpha).toEqual({
      id: `${card.id}:0`,
      cardId: card.id,
      cardName: "Sol Ring",
      faceIndex: 0,
      artCropUrl: card.image_uris.art_crop,
      smallUrl: card.image_uris.small,
      artist: "Mark Tedin",
      setName: "Limited Edition Alpha",
      setCode: "lea",
      collectorNumber: "270",
      releasedAt: "1993-08-05",
      illustrationId: card.illustration_id,
    });
    expect(alpha.faceName).toBeUndefined();
  });

  it("maps a transform DFC to one option per face using card_faces[].image_uris", async () => {
    server.use(searchHandler());
    const arts = await fastClient().searchArts("Delver of Secrets");
    const card = searchDelver.data[0]!;
    expect(arts).toHaveLength(2);
    expect(arts.map((a) => [a.faceIndex, a.faceName])).toEqual([
      [0, "Delver of Secrets"],
      [1, "Insectile Aberration"],
    ]);
    expect(arts[0]!.artCropUrl).toBe(card.card_faces[0]!.image_uris.art_crop);
    expect(arts[1]!.artCropUrl).toBe(card.card_faces[1]!.image_uris.art_crop);
    expect(arts[1]!.artCropUrl).toContain("/art_crop/back/");
    expect(arts[1]!.illustrationId).toBe(card.card_faces[1]!.illustration_id);
    expect(arts[0]!.id).not.toBe(arts[1]!.id);
    expect(arts[1]!.cardName).toBe("Delver of Secrets // Insectile Aberration");
  });

  it("maps a modal_dfc with per-face artists", async () => {
    server.use(searchHandler());
    const arts = await fastClient().searchArts("Agadeem's Awakening");
    expect(arts.map((a) => [a.faceName, a.artist])).toEqual([
      ["Agadeem's Awakening", "Front Artist"],
      ["Agadeem, the Undercrypt", "Back Artist"],
    ]);
  });

  it("caps pagination at maxPages (default 3)", async () => {
    let served = 0;
    server.use(
      http.get(`${API}/cards/search`, ({ request }) => {
        served++;
        const page = Number(new URL(request.url).searchParams.get("page") ?? "1");
        const card = { ...solPage2.data[0]!, id: `card-${page}` };
        return HttpResponse.json({
          object: "list",
          has_more: true,
          next_page: `${API}/cards/search?q=x&page=${page + 1}`,
          data: [card],
        });
      }),
    );
    const client = fastClient();
    const arts = await client.searchArts("Endless");
    expect(served).toBe(3);
    expect(arts.map((a) => a.cardId)).toEqual(["card-1", "card-2", "card-3"]);
    served = 0;
    expect(await client.searchArts("Endless", { maxPages: 1 })).toHaveLength(1);
    expect(served).toBe(1);
  });

  it("returns [] when Scryfall answers 404 (no match) and for blank names", async () => {
    server.use(searchHandler());
    const client = fastClient();
    expect(await client.searchArts("Not A Real Card")).toEqual([]);
    expect(await client.searchArts('  ""  ')).toEqual([]);
    expect(seen).toHaveLength(1);
  });

  it("refuses to follow a next_page outside the API origin", async () => {
    server.use(
      http.get(`${API}/cards/search`, () =>
        HttpResponse.json({ ...solPage1, next_page: "https://evil.example/cards/search?page=2" }),
      ),
    );
    await expect(fastClient().searchArts("Sol Ring")).rejects.toMatchObject({
      name: "ScryfallError",
      code: "bad_url",
    });
  });

  it("propagates errors on later pages", async () => {
    server.use(
      http.get(`${API}/cards/search`, ({ request }) =>
        new URL(request.url).searchParams.get("page") === "2"
          ? HttpResponse.json(error404Search, { status: 404 })
          : HttpResponse.json(solPage1),
      ),
    );
    await expect(fastClient().searchArts("Sol Ring")).rejects.toBeInstanceOf(ScryfallError);
  });
});

describe("cardNamed and errors", () => {
  it("returns the Card object for an exact name", async () => {
    server.use(http.get(`${API}/cards/named`, () => HttpResponse.json(namedSolRing)));
    const card = await fastClient().cardNamed(" Sol Ring ");
    expect(card.name).toBe("Sol Ring");
    expect(new URL(seen[0]!.url).searchParams.get("exact")).toBe("Sol Ring");
  });

  it("maps a 404 Error object to a typed ScryfallError", async () => {
    server.use(
      http.get(`${API}/cards/named`, () => HttpResponse.json(error404Named, { status: 404 })),
    );
    const err = await fastClient()
      .cardNamed("Not A Real Card")
      .catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ScryfallError);
    const se = err as ScryfallError;
    expect(se.status).toBe(404);
    expect(se.code).toBe("not_found");
    expect(se.details).toBe(error404Named.details);
    expect(se.isNotFound).toBe(true);
    expect(se.isNetwork).toBe(false);
  });

  it("maps non-JSON error bodies and non-JSON success bodies", async () => {
    server.use(
      http.get(`${API}/cards/named`, () => new HttpResponse("oops", { status: 502 })),
      http.get(`${API}/symbology`, () => new HttpResponse("<html>", { status: 200 })),
    );
    const client = fastClient();
    await expect(client.cardNamed("x")).rejects.toMatchObject({ status: 502, code: "http_error" });
    await expect(client.symbology()).rejects.toMatchObject({ status: 200, code: "bad_response" });
  });

  it("maps network failures to status 0 / code network", async () => {
    server.use(http.get(`${API}/symbology`, () => HttpResponse.error()));
    const err = (await fastClient()
      .symbology()
      .catch((e: unknown) => e)) as ScryfallError;
    expect(err).toBeInstanceOf(ScryfallError);
    expect(err.isNetwork).toBe(true);
    expect(err.code).toBe("network");
  });

  it("wraps non-Error fetch rejections too", async () => {
    const client = fastClient({ fetch: () => Promise.reject("boom") });
    await expect(client.symbology()).rejects.toMatchObject({ code: "network", details: "boom" });
  });
});

describe("429 handling (ART-006)", () => {
  it("backs off exponentially, honours Retry-After, then succeeds", async () => {
    let calls = 0;
    server.use(
      http.get(`${API}/symbology`, () => {
        calls++;
        if (calls === 1) return HttpResponse.json(error429, { status: 429 });
        if (calls === 2)
          return HttpResponse.json(error429, { status: 429, headers: { "Retry-After": "3" } });
        if (calls === 3) return HttpResponse.json(error429, { status: 429 });
        return HttpResponse.json(symbologyFixture);
      }),
    );
    const delays: number[] = [];
    const client = createScryfallClient({
      spacingMs: 0,
      sleep: async (ms) => {
        delays.push(ms);
      },
    });
    const symbols = await client.symbology();
    expect(calls).toBe(4);
    expect(delays).toEqual([1000, 3000, 4000]);
    expect(symbols.length).toBeGreaterThan(0);
  });

  it("gives up after 3 retries with a typed 429 error", async () => {
    let calls = 0;
    server.use(
      http.get(`${API}/symbology`, () => {
        calls++;
        return HttpResponse.json(error429, { status: 429 });
      }),
    );
    const err = (await fastClient()
      .symbology()
      .catch((e: unknown) => e)) as ScryfallError;
    expect(calls).toBe(4);
    expect(err).toBeInstanceOf(ScryfallError);
    expect(err.status).toBe(429);
    expect(err.code).toBe("rate_limited");
  });

  it("parses Retry-After seconds and HTTP dates, capped", () => {
    const now = Date.parse("2026-11-01T12:00:00Z");
    expect(parseRetryAfter(null, now)).toBeUndefined();
    expect(parseRetryAfter("  ", now)).toBeUndefined();
    expect(parseRetryAfter("soon", now)).toBeUndefined();
    expect(parseRetryAfter("2", now)).toBe(2000);
    expect(parseRetryAfter("0.5", now)).toBe(500);
    expect(parseRetryAfter("Sun, 01 Nov 2026 12:00:05 GMT", now)).toBe(5000);
    expect(parseRetryAfter("Sun, 01 Nov 2026 11:00:00 GMT", now)).toBe(0);
    expect(parseRetryAfter("3600", now)).toBe(MAX_RETRY_AFTER_MS);
  });
});

describe("request queue etiquette (ART-006)", () => {
  it("spaces requests ≥ 100 ms apart (fake timers)", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "Date"] });
    vi.setSystemTime(Date.parse("2026-11-01T12:00:00Z"));
    const times: number[] = [];
    server.use(http.get(`${API}/cards/autocomplete`, () => HttpResponse.json(autocompleteSol)));
    // Record when the client issues each request (MSW serves it on later real ticks).
    const client = createScryfallClient({
      fetch: (input, init) => {
        times.push(Date.now());
        return globalThis.fetch(input, init);
      },
    });
    const t0 = Date.now();
    let done = false;
    const all = Promise.all(
      ["sol", "soli", "solit", "solitu"].map((q) => client.autocomplete(q)),
    ).finally(() => (done = true));
    // MSW resolves responses on real ticks, so interleave fake-time steps with real ticks.
    const step = async () => {
      await vi.advanceTimersByTimeAsync(10);
      await new Promise((r) => setImmediate(r));
    };
    for (let i = 0; i < 9; i++) await step();
    expect(times).toEqual([t0]); // 90 ms in: the second request is still waiting
    while (!done) await step();
    await all;
    expect(times).toHaveLength(4);
    for (let i = 1; i < times.length; i++) {
      expect(times[i]! - times[i - 1]!).toBeGreaterThanOrEqual(100);
    }
    // ≤ 10 requests per second
    expect(times[3]! - times[0]!).toBeGreaterThanOrEqual(300);
  });

  it("keeps at most one request in flight", async () => {
    let inFlight = 0;
    let maxInFlight = 0;
    server.use(
      http.get(`${API}/cards/autocomplete`, async () => {
        inFlight++;
        maxInFlight = Math.max(maxInFlight, inFlight);
        await new Promise((r) => setTimeout(r, 5));
        inFlight--;
        return HttpResponse.json(autocompleteSol);
      }),
    );
    const client = createScryfallClient({ spacingMs: 0 });
    await Promise.all(["ab", "abc", "abcd", "abcde", "abcdef"].map((q) => client.autocomplete(q)));
    expect(seen).toHaveLength(5);
    expect(maxInFlight).toBe(1);
  });

  it("rejects an aborted request immediately, even while queued, without fetching it", async () => {
    let release: () => void = () => {};
    server.use(
      http.get(`${API}/cards/autocomplete`, async () => {
        await new Promise<void>((r) => (release = r));
        return HttpResponse.json(autocompleteSol);
      }),
    );
    const client = fastClient();
    const first = client.autocomplete("sol");
    const ac = new AbortController();
    const second = client.autocomplete("atraxa", { signal: ac.signal });
    ac.abort();
    await expect(second).rejects.toMatchObject({ name: "AbortError" });
    await vi.waitFor(() => expect(seen).toHaveLength(1));
    release();
    await expect(first).resolves.toEqual(autocompleteSol.data);
    expect(seen).toHaveLength(1);

    const pre = new AbortController();
    pre.abort();
    await expect(client.autocomplete("sol", { signal: pre.signal })).rejects.toMatchObject({
      name: "AbortError",
    });
  });

  it("aborts an in-flight fetch", async () => {
    server.use(
      http.get(`${API}/cards/autocomplete`, async () => {
        await new Promise(() => {});
        return HttpResponse.json(autocompleteSol);
      }),
    );
    const ac = new AbortController();
    const p = fastClient().autocomplete("sol", { signal: ac.signal });
    await vi.waitFor(() => expect(seen).toHaveLength(1));
    ac.abort();
    await expect(p).rejects.toMatchObject({ name: "AbortError" });
  });
});

describe("response cache (ART-006: 24 h)", () => {
  it("serves from cache within the TTL and refetches after expiry", async () => {
    let t = 1_000_000;
    const now = () => t;
    server.use(autocompleteHandler());
    const cache = createMemoryCache({ now });
    const client = fastClient({ cache, now });
    await client.autocomplete("sol");
    t += DEFAULT_TTL_MS - 1;
    expect(await client.autocomplete("sol")).toEqual(autocompleteSol.data);
    expect(seen).toHaveLength(1);
    t += 2;
    expect(await client.autocomplete("sol")).toEqual(autocompleteSol.data);
    expect(seen).toHaveLength(2);
    expect(await cache.count()).toBe(1);
  });

  it("does not cache error responses", async () => {
    server.use(
      http.get(`${API}/cards/named`, () => HttpResponse.json(error404Named, { status: 404 })),
    );
    const cache = createMemoryCache();
    const client = fastClient({ cache });
    await expect(client.cardNamed("Nope")).rejects.toBeInstanceOf(ScryfallError);
    expect(await cache.count()).toBe(0);
  });

  it("falls back to a stale entry when offline", async () => {
    let t = 0;
    const now = () => t;
    const cache = createMemoryCache({ now });
    server.use(http.get(`${API}/symbology`, () => HttpResponse.json(symbologyFixture)));
    const client = fastClient({ cache, now });
    const online = await client.symbology();
    t += DEFAULT_TTL_MS * 3;
    server.use(http.get(`${API}/symbology`, () => HttpResponse.error()));
    expect(await client.symbology()).toEqual(online);
  });

  it("treats a throwing cache as a miss and still succeeds", async () => {
    const broken: KeyValueCache = {
      get: () => Promise.reject(new Error("quota")),
      set: () => Promise.reject(new Error("quota")),
    };
    server.use(autocompleteHandler());
    expect(await fastClient({ cache: broken }).autocomplete("sol")).toEqual(autocompleteSol.data);
  });
});

describe("symbology (TOOL-011)", () => {
  it("returns W U B R G C first, keeps {T} {X}, drops funny symbols", async () => {
    server.use(http.get(`${API}/symbology`, () => HttpResponse.json(symbologyFixture)));
    const symbols = await fastClient().symbology();
    expect(symbols.slice(0, 6).map((s) => s.symbol)).toEqual([
      "{W}",
      "{U}",
      "{B}",
      "{R}",
      "{G}",
      "{C}",
    ]);
    const names = symbols.map((s) => s.symbol);
    expect(names).toEqual(expect.arrayContaining(["{T}", "{X}"]));
    expect(names).not.toContain("{HW}");
    expect(symbols[0]).toEqual({
      symbol: "{W}",
      svgUri: "https://svgs.scryfall.io/card-symbols/W.svg",
      english: "one white mana",
    });
  });
});

describe("getJson", () => {
  it("accepts relative paths without a leading slash and a custom base URL", async () => {
    server.use(
      http.get("https://proxy.example/api/symbology", () => HttpResponse.json(symbologyFixture)),
    );
    const client = fastClient({ baseUrl: "https://proxy.example/api/" });
    const list = await client.getJson<{ object: string }>("symbology");
    expect(list.object).toBe("list");
  });
});
