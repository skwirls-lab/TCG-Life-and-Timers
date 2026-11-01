// @req SET-040 @req SET-041 @req SET-042
import { afterEach, describe, expect, it, vi } from "vitest";
import { createGame, seededRng, type Game, type GameEvent } from "@/engine";
import { getBuiltInPreset } from "@/presets";
import { useGameStore } from "@/state/gameStore";
import {
  assembleDiagnostics,
  buildDiagnostics,
  DIAGNOSTICS_EVENTS,
  diagnosticsJson,
  REDACTED,
} from "./diagnostics";
import { shareApp } from "./share";
import {
  CloudUnavailableError,
  feedbackData,
  OfflineError,
  submitFeedback,
  withTimeout,
} from "./submit";
import pkg from "../../../package.json";
import { appVersion, PACKAGE_VERSION } from "./version";

function game(): Game {
  const preset = getBuiltInPreset("mtg.commander")!;
  const g = createGame(
    { preset, players: 2, seats: [{ name: "Alice Smith" }, { name: "Bob" }] },
    seededRng(1),
    1000,
  );
  const log: GameEvent[] = [];
  for (let i = 0; i < 250; i++)
    log.push({
      id: `e${i}`,
      at: i,
      kind: "counter",
      seatId: g.seats[0]!.id,
      delta: -1,
      meta: { note: "x" },
    } as GameEvent);
  log.push({
    id: "rename",
    at: 300,
    kind: "counter",
    meta: { from: "Alice Smith", to: "bob", seatName: "Zed", img: "data:image/png;base64,AAA" },
  } as GameEvent);
  return { ...g, log };
}

const src = (g: Game | null) => ({
  appVersion: "1.2.3",
  userAgent: "UA",
  settings: { theme: "dark" },
  game: g,
  now: 0,
});

describe("diagnostics", () => {
  // @req SET-042
  it("redacts names unless the user ticks include names", () => {
    const g = game();
    const d = assembleDiagnostics({ includeNames: false }, src(g));
    expect(d.game!.seats.map((s) => s.name)).toEqual(["Player 1", "Player 2"]);
    expect(d.game!.events).toHaveLength(DIAGNOSTICS_EVENTS);
    expect(d.game!.eventCount).toBe(251);
    const rename = d.game!.events.at(-1)!;
    expect(rename.meta).toEqual({
      from: REDACTED,
      to: REDACTED,
      seatName: REDACTED,
      img: REDACTED,
    });
    const json = diagnosticsJson(d);
    expect(json).not.toContain("Alice");
    expect(json).not.toContain("Bob");

    const named = assembleDiagnostics({ includeNames: true }, src(g));
    expect(named.game!.seats.map((s) => s.name)).toEqual(["Alice Smith", "Bob"]);
    expect(named.game!.events.at(-1)!.meta).toMatchObject({
      from: "Alice Smith",
      to: "bob",
      img: REDACTED,
    });
    expect(named.activePresetId).toBe("mtg.commander");
  });

  it("works without a game and trims oversized bundles", () => {
    expect(assembleDiagnostics({ includeNames: false }, src(null)).game).toBeNull();
    const g = game();
    const huge = assembleDiagnostics({ includeNames: false }, { ...src(g), settings: {} });
    huge.game!.events = huge.game!.events.map((e) => ({ ...e, meta: { blob: "y".repeat(2000) } }));
    const json = diagnosticsJson(huge);
    expect(json.length).toBeLessThanOrEqual(200 * 1024);
    expect((JSON.parse(json) as { game: { events: unknown[] } }).game.events.length).toBeLessThan(
      200,
    );
  });

  it("buildDiagnostics collects from the running stores", async () => {
    useGameStore.setState({ session: { game: game(), past: [], future: [] } as never });
    const d = await buildDiagnostics({ includeNames: false });
    expect(d.appVersion).toBe(appVersion());
    expect(d.game!.seats[0]!.name).toBe("Player 1");
    expect(d.settings).toMatchObject({ theme: "dark" });
    useGameStore.setState({ session: null });
    const none = await buildDiagnostics({ includeNames: true });
    expect(none.game).toBeNull();
    const injected = await buildDiagnostics({ includeNames: true }, { game: null, userAgent: "X" });
    expect(injected.userAgent).toBe("X");
  });

  it("appVersion prefers the env override", () => {
    expect(appVersion("9.9.9")).toBe("9.9.9");
    expect(appVersion("")).toBe(PACKAGE_VERSION);
  });

  it("PACKAGE_VERSION matches package.json", () => {
    expect(PACKAGE_VERSION).toBe(pkg.version);
  });
});

describe("submitFeedback", () => {
  const anon = { uid: "anon1", email: null, displayName: null, photoURL: null, isAnonymous: true };

  // @req SET-041
  it("validates, ensures an (anonymous) user and writes the doc", async () => {
    const write = vi.fn(async () => "doc1");
    const id = await submitFeedback(
      { category: "bug", text: "  Timer froze  ", email: " me@x.io ", diagnostics: '{"a":1}' },
      { isOnline: () => true, ensureUser: async () => anon, write, appVersion: () => "0.1.0" },
    );
    expect(id).toBe("doc1");
    expect(write).toHaveBeenCalledWith({
      category: "bug",
      text: "Timer froze",
      email: "me@x.io",
      appVersion: "0.1.0",
      uid: "anon1",
      diagnostics: '{"a":1}',
    });
  });

  it("keeps the draft when offline or cloud is unavailable", async () => {
    const write = vi.fn();
    await expect(
      submitFeedback(
        { category: "idea", text: "x" },
        { isOnline: () => false, ensureUser: async () => anon, write },
      ),
    ).rejects.toBeInstanceOf(OfflineError);
    await expect(
      submitFeedback(
        { category: "idea", text: "x" },
        { isOnline: () => true, ensureUser: async () => null, write },
      ),
    ).rejects.toBeInstanceOf(CloudUnavailableError);
    expect(write).not.toHaveBeenCalled();
  });

  it("rejects invalid input before the network", async () => {
    const ensureUser = vi.fn();
    await expect(
      submitFeedback({ category: "bug", text: "   " }, { ensureUser }),
    ).rejects.toThrow();
    await expect(
      submitFeedback({ category: "bug", text: "x".repeat(4001) }, { ensureUser }),
    ).rejects.toThrow();
    expect(ensureUser).not.toHaveBeenCalled();
    expect(feedbackData({ category: "other", text: "hi", email: "  " }, "1")).toEqual({
      category: "other",
      text: "hi",
      appVersion: "1",
    });
  });

  it("withTimeout rejects slow writes", async () => {
    await expect(
      withTimeout(new Promise(() => {}), 5, () => new OfflineError()),
    ).rejects.toBeInstanceOf(OfflineError);
    await expect(withTimeout(Promise.resolve(1), 50, () => new OfflineError())).resolves.toBe(1);
    await expect(withTimeout(Promise.reject("s"), 50, () => new OfflineError())).rejects.toThrow(
      "s",
    );
  });
});

describe("shareApp", () => {
  afterEach(() => vi.restoreAllMocks());
  const copy = { title: "T", text: "X" };

  // @req SET-040
  it("uses the Web Share API when available", async () => {
    const share = vi.fn(async () => {});
    expect(await shareApp(copy, { navigator: { share }, url: "https://a.app" })).toBe("shared");
    expect(share).toHaveBeenCalledWith({ title: "T", text: "X", url: "https://a.app" });
    const abort = Object.assign(new Error("x"), { name: "AbortError" });
    expect(
      await shareApp(copy, { navigator: { share: () => Promise.reject(abort) }, url: "u" }),
    ).toBe("cancelled");
  });

  it("falls back to copying the link", async () => {
    const writeText = vi.fn(async () => {});
    expect(await shareApp(copy, { navigator: { clipboard: { writeText } }, url: "u" })).toBe(
      "copied",
    );
    expect(
      await shareApp(copy, {
        navigator: {
          share: () => Promise.reject(new Error("no")),
          canShare: () => true,
          clipboard: { writeText },
        },
        url: "u",
      }),
    ).toBe("copied");
    expect(
      await shareApp(copy, { navigator: { share: vi.fn(), canShare: () => false }, url: "u" }),
    ).toBe("failed");
    expect(
      await shareApp(copy, {
        navigator: { clipboard: { writeText: () => Promise.reject(new Error()) } },
        url: "u",
      }),
    ).toBe("failed");
    expect(await shareApp(copy)).toBe("failed"); // jsdom: neither API
  });
});
