// @req ART-006 @req ART-009 @req PWA-002
import { describe, expect, it } from "vitest";
import {
  CACHEABLE_STATUSES,
  isScryfallApi,
  isScryfallImage,
  scryfallImageRoute,
  SCRYFALL_API_LIMITS,
  SCRYFALL_IMAGE_LIMITS,
} from "./swRules";

describe("service worker Scryfall caching rules", () => {
  it("matches card images on cards.scryfall.io only", () => {
    expect(isScryfallImage(new URL("https://cards.scryfall.io/art_crop/front/a/b/x.jpg?17"))).toBe(
      true,
    );
    expect(isScryfallImage(new URL("https://api.scryfall.com/cards/named?exact=x"))).toBe(false);
    expect(isScryfallImage(new URL("http://cards.scryfall.io/x.jpg"))).toBe(false);
    expect(isScryfallImage(new URL("https://evil.test/cards.scryfall.io/x.jpg"))).toBe(false);
  });

  it("no-cors image loads are cached; CORS copies go to the network", () => {
    const u = new URL("https://cards.scryfall.io/art_crop/x.jpg");
    expect(scryfallImageRoute(u, "no-cors")).toBe("cache");
    expect(scryfallImageRoute(u, "cors")).toBe("network");
    expect(scryfallImageRoute(new URL("https://example.test/x.jpg"), "no-cors")).toBeNull();
  });

  it("matches GET API calls only", () => {
    expect(isScryfallApi(new URL("https://api.scryfall.com/cards/autocomplete?q=sol"))).toBe(true);
    expect(isScryfallApi(new URL("https://api.scryfall.com/cards/search"), "POST")).toBe(false);
    expect(isScryfallApi(new URL("https://cards.scryfall.io/x.jpg"))).toBe(false);
  });

  // @req ART-006
  it("limits: 200 images for 30 days (LRU), API 50 entries for 24 h; opaque images cacheable", () => {
    expect(SCRYFALL_IMAGE_LIMITS).toEqual({ maxEntries: 200, maxAgeSeconds: 2_592_000 });
    expect(SCRYFALL_API_LIMITS).toEqual({ maxEntries: 50, maxAgeSeconds: 86_400 });
    expect(CACHEABLE_STATUSES).toContain(0);
  });
});
