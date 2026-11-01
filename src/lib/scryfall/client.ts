/**
 * Scryfall API client (T5.1; ART-001..003, ART-006, TOOL-011).
 *
 * Etiquette (ART-006): one request in flight, ≥ 100 ms between request starts (≤ 10 req/s),
 * `Accept: application/json`, no User-Agent (browsers can't set it), JSON responses cached
 * for 24 h, 429 → exponential backoff honouring `Retry-After` (max 3 retries).
 */
import type { KeyValueCache } from "./cache";
import { ScryfallError, errorFromResponse, isAbortError, throwIfAborted } from "./errors";
import { artOptionsFromCard, mapSymbology } from "./map";
import { createRequestQueue, defaultSleep, type Sleep } from "./queue";
import type {
  ArtOption,
  ManaSymbol,
  ScryfallCard,
  ScryfallCardSymbol,
  ScryfallCatalog,
  ScryfallList,
} from "./types";

export const SCRYFALL_API_BASE = "https://api.scryfall.com";
export const DEFAULT_TTL_MS = 24 * 60 * 60 * 1000;
export const DEFAULT_SPACING_MS = 100;
export const DEFAULT_MAX_RETRIES = 3;
export const DEFAULT_BACKOFF_MS = 1000;
export const MAX_RETRY_AFTER_MS = 60_000;
export const DEFAULT_MAX_PAGES = 3;
export const AUTOCOMPLETE_MIN_CHARS = 2;

export interface ScryfallClientOptions {
  fetch?: typeof fetch;
  cache?: KeyValueCache;
  now?: () => number;
  sleep?: Sleep;
  baseUrl?: string;
  spacingMs?: number;
  ttlMs?: number;
  maxRetries?: number;
  /** First backoff delay when no Retry-After is sent; doubles each retry. */
  backoffMs?: number;
}

export interface RequestOptions {
  signal?: AbortSignal;
}

export interface SearchArtsOptions extends RequestOptions {
  /** Maximum result pages to follow via `next_page`. Default 3. */
  maxPages?: number;
}

export interface ScryfallClient {
  /** GET a JSON resource (path relative to the API base, or an absolute API URL). */
  getJson<T>(pathOrUrl: string, opts?: RequestOptions): Promise<T>;
  /** Card-name suggestions (ART-001). Returns [] for queries shorter than 2 characters. */
  autocomplete(q: string, opts?: RequestOptions): Promise<string[]>;
  /** Every distinct artwork of an exact card name, newest first (ART-002, ART-003). */
  searchArts(name: string, opts?: SearchArtsOptions): Promise<ArtOption[]>;
  /** Exact-name card lookup (commander auto-art, ART-008). Throws ScryfallError(404). */
  cardNamed(exact: string, opts?: RequestOptions): Promise<ScryfallCard>;
  /** Card symbols for the Mana & Storm page (TOOL-011). */
  symbology(opts?: RequestOptions): Promise<ManaSymbol[]>;
}

/** Parse a Retry-After header (delta-seconds or HTTP date) into ms, capped. */
export function parseRetryAfter(value: string | null, now: number): number | undefined {
  if (value === null) return undefined;
  const trimmed = value.trim();
  if (trimmed === "") return undefined;
  let ms: number;
  if (/^\d+(\.\d+)?$/.test(trimmed)) ms = Number(trimmed) * 1000;
  else {
    const at = Date.parse(trimmed);
    if (Number.isNaN(at)) return undefined;
    ms = at - now;
  }
  return Math.min(Math.max(0, ms), MAX_RETRY_AFTER_MS);
}

export function createScryfallClient(opts: ScryfallClientOptions = {}): ScryfallClient {
  // Resolve fetch lazily so test interceptors (MSW) installed later are honoured.
  const doFetch: typeof fetch = opts.fetch ?? ((input, init) => globalThis.fetch(input, init));
  const cache = opts.cache;
  const now = opts.now ?? (() => Date.now());
  const sleep = opts.sleep ?? defaultSleep;
  const base = (opts.baseUrl ?? SCRYFALL_API_BASE).replace(/\/+$/, "");
  const baseOrigin = new URL(base).origin;
  const ttlMs = opts.ttlMs ?? DEFAULT_TTL_MS;
  const maxRetries = opts.maxRetries ?? DEFAULT_MAX_RETRIES;
  const backoffMs = opts.backoffMs ?? DEFAULT_BACKOFF_MS;
  const queue = createRequestQueue({ spacingMs: opts.spacingMs ?? DEFAULT_SPACING_MS, now, sleep });

  function resolveUrl(pathOrUrl: string): string {
    const url = /^https?:\/\//.test(pathOrUrl)
      ? new URL(pathOrUrl)
      : new URL(base + (pathOrUrl.startsWith("/") ? "" : "/") + pathOrUrl);
    if (url.origin !== baseOrigin) {
      throw new ScryfallError({
        status: 0,
        code: "bad_url",
        details: `Refusing to fetch outside ${baseOrigin}`,
      });
    }
    return url.toString();
  }

  async function readCache(key: string) {
    if (!cache) return undefined;
    try {
      return await cache.get(key);
    } catch {
      return undefined;
    }
  }

  async function writeCache(key: string, value: unknown) {
    if (!cache) return;
    try {
      await cache.set(key, value);
    } catch {
      // A failing cache (quota, private mode) must never break a request.
    }
  }

  /** One HTTP attempt through the queue. Returns the response and its parsed body. */
  function attempt(url: string, signal?: AbortSignal) {
    return queue.run(async () => {
      let res: Response;
      try {
        res = await doFetch(url, { headers: { Accept: "application/json" }, signal });
      } catch (e) {
        if (isAbortError(e)) throw e;
        throw new ScryfallError({
          status: 0,
          code: "network",
          details: e instanceof Error ? e.message : String(e),
          cause: e,
        });
      }
      let body: unknown;
      try {
        body = await res.json();
      } catch (e) {
        if (isAbortError(e)) throw e;
        body = undefined;
      }
      return { res, body };
    }, signal);
  }

  async function getJson<T>(pathOrUrl: string, ro: RequestOptions = {}): Promise<T> {
    const { signal } = ro;
    throwIfAborted(signal);
    const url = resolveUrl(pathOrUrl);
    const cached = await readCache(url);
    if (cached && now() - cached.storedAt < ttlMs) return cached.value as T;

    for (let retry = 0; ; retry++) {
      let outcome: Awaited<ReturnType<typeof attempt>>;
      try {
        outcome = await attempt(url, signal);
      } catch (e) {
        // Offline: serve a stale copy rather than nothing (ART-009, TOOL-011).
        if (e instanceof ScryfallError && e.isNetwork && cached) return cached.value as T;
        throw e;
      }
      const { res, body } = outcome;
      if (res.status === 429 && retry < maxRetries) {
        const hinted = parseRetryAfter(res.headers.get("Retry-After"), now());
        const delay = hinted ?? backoffMs * 2 ** retry;
        // Back off inside the queue so every other request pauses too.
        await queue.run(() => sleep(delay, signal), signal);
        continue;
      }
      if (!res.ok) throw errorFromResponse(res.status, body);
      if (body === undefined) {
        throw new ScryfallError({
          status: res.status,
          code: "bad_response",
          details: "Response was not JSON",
        });
      }
      await writeCache(url, body);
      return body as T;
    }
  }

  async function autocomplete(q: string, ro: RequestOptions = {}): Promise<string[]> {
    const query = q.trim();
    if (query.length < AUTOCOMPLETE_MIN_CHARS) return [];
    const params = new URLSearchParams({ q: query });
    const catalog = await getJson<ScryfallCatalog>(`/cards/autocomplete?${params}`, ro);
    return catalog.data;
  }

  async function searchArts(name: string, so: SearchArtsOptions = {}): Promise<ArtOption[]> {
    const exact = name.replaceAll('"', "").trim();
    if (!exact) return [];
    const maxPages = Math.max(1, so.maxPages ?? DEFAULT_MAX_PAGES);
    const params = new URLSearchParams({ q: `!"${exact}"`, unique: "art", order: "released" });
    let next: string | undefined = `/cards/search?${params}`;
    const out: ArtOption[] = [];
    for (let page = 0; next && page < maxPages; page++) {
      let list: ScryfallList<ScryfallCard>;
      try {
        list = await getJson<ScryfallList<ScryfallCard>>(next, so);
      } catch (e) {
        // /cards/search answers 404 when nothing matches: that is an empty result.
        if (page === 0 && e instanceof ScryfallError && e.isNotFound) return [];
        throw e;
      }
      for (const card of list.data) out.push(...artOptionsFromCard(card));
      next = list.has_more ? list.next_page : undefined;
    }
    return out;
  }

  async function cardNamed(exact: string, ro: RequestOptions = {}): Promise<ScryfallCard> {
    const params = new URLSearchParams({ exact: exact.trim() });
    return getJson<ScryfallCard>(`/cards/named?${params}`, ro);
  }

  async function symbology(ro: RequestOptions = {}): Promise<ManaSymbol[]> {
    const list = await getJson<ScryfallList<ScryfallCardSymbol>>("/symbology", ro);
    return mapSymbology(list.data);
  }

  return { getJson, autocomplete, searchArts, cardNamed, symbology };
}
