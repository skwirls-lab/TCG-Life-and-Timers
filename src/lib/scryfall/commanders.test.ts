// @vitest-environment node
// @req PROF-010 @req ART-006
import { http, HttpResponse } from "msw";
import { setupServer } from "msw/node";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import error404Search from "../../../tests/fixtures/scryfall/error-404-search.json";
import { commanderSearch } from "../../../tests/fixtures/scryfall/commanders";
import { commanderSearchQuery, createScryfallClient } from "./client";

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
});
afterAll(() => server.close());

const fastClient = () => createScryfallClient({ sleep: async () => {} });

function commanderHandler() {
  return http.get(`${API}/cards/search`, ({ request }) => {
    const body = commanderSearch(new URL(request.url).searchParams.get("q") ?? "");
    return body ? HttpResponse.json(body) : HttpResponse.json(error404Search, { status: 404 });
  });
}

describe("searchCommanders (PROF-010)", () => {
  it("builds an is:commander name query that typed syntax can't change", () => {
    expect(commanderSearchQuery("  Atraxa ")).toBe("Atraxa is:commander");
    expect(commanderSearchQuery("raised by", true)).toBe(
      "raised by (is:commander OR t:background)",
    );
    expect(commanderSearchQuery('t:land -"x" (or) OR k')).toBe("t land x k is:commander");
    expect(commanderSearchQuery("Yuriko, the Tiger's")).toBe("Yuriko the Tiger's is:commander");
    expect(commanderSearchQuery("a")).toBe("");
    expect(commanderSearchQuery(" ( ) ")).toBe("");
  });

  it("returns commander-eligible cards, most played first; Backgrounds only for partners", async () => {
    server.use(commanderHandler());
    const client = fastClient();
    const found = await client.searchCommanders("atraxa");
    expect(found.map((c) => c.name)).toEqual(["Atraxa, Praetors' Voice", "Atraxa, Grand Unifier"]);
    const params = new URL(seen[0]!.url).searchParams;
    expect(seen[0]!.headers.get("accept")).toBe("application/json");
    expect(params.get("q")).toBe("atraxa is:commander");
    expect(params.get("order")).toBe("edhrec");
    expect(params.get("unique")).toBe("cards");
    expect(await client.searchCommanders("raised")).toEqual([]);
    const partner = await client.searchCommanders("raised", { partner: true });
    expect(partner[0]?.type_line).toContain("Background");
    expect(await client.searchCommanders("ra", { limit: 1 })).toHaveLength(1);
  });

  it("short-circuits short queries and maps 404 to no results", async () => {
    server.use(commanderHandler());
    const client = fastClient();
    expect(await client.searchCommanders("x")).toEqual([]);
    expect(seen).toHaveLength(0);
    expect(await client.searchCommanders("zzzz")).toEqual([]);
  });

  it("surfaces other errors (the picker falls back to free text)", async () => {
    server.use(http.get(`${API}/cards/search`, () => HttpResponse.error()));
    await expect(fastClient().searchCommanders("atraxa")).rejects.toMatchObject({
      code: "network",
    });
  });
});
