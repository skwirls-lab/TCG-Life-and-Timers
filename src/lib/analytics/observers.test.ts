// @req LEG-004
import { beforeEach, describe, expect, it, vi } from "vitest";
import { create } from "zustand";
import type { TelemetryConfig } from "./config";
import { useConsent } from "./consent";
import {
  observeAuth,
  observeGames,
  observePaywall,
  type AuthLike,
  type GameStoreLike,
  type ObservedGame,
  type PaywallLike,
} from "./observers";
import { configureTelemetry, resetTelemetryForTests } from "./telemetry";

const CFG: TelemetryConfig = {
  firebase: {
    apiKey: "k",
    authDomain: "a",
    projectId: "p",
    storageBucket: "b",
    messagingSenderId: "1",
    appId: "a",
  },
  measurementId: "G-1",
  sentryDsn: null,
  release: "1",
};

const flush = () => new Promise((r) => setTimeout(r, 0));
let logs: [string, Record<string, unknown>][] = [];

function game(patch: Partial<ObservedGame> = {}): ObservedGame {
  return {
    id: "g1",
    status: "ready",
    preset: { id: "mtg.commander" },
    seats: [1, 2, 3, 4],
    turn: { turnNumber: 1 },
    timer: { mode: "off" },
    log: [],
    ...patch,
  };
}

beforeEach(() => {
  localStorage.clear();
  resetTelemetryForTests();
  logs = [];
  configureTelemetry({
    config: () => CFG,
    loadAnalytics: vi.fn(async () => ({
      log: (n: string, p: Record<string, unknown>) => logs.push([n, p]),
      setEnabled: () => undefined,
    })),
  });
  useConsent.setState({ choice: "granted" });
});

describe("game observers (§19.5)", () => {
  it("emits game_start once per game, game_end with duration and turns", async () => {
    const store = create<GameStoreLike>(() => ({ session: { game: game() } }));
    const stop = observeGames(store);
    store.setState({ session: { game: game({ status: "running", startedAt: 1_000 }) } });
    store.setState({ session: { game: game({ status: "paused", startedAt: 1_000 }) } });
    store.setState({
      session: {
        game: game({ status: "ended", startedAt: 1_000, endedAt: 61_400, turn: { turnNumber: 9 } }),
      },
    });
    store.setState({ session: { game: game({ status: "ended", startedAt: 1_000 }) } });
    await flush();
    expect(logs).toEqual([
      ["game_start", { preset: "mtg.commander", players: 4, timers: false, mode: "off" }],
      ["game_end", { duration_s: 60, turns: 9 }],
    ]);
    stop();
  });

  it("does not re-count a restored game, counts timer respond/timeout events", async () => {
    const restored = game({ status: "running", timer: { mode: "bank" } });
    const store = create<GameStoreLike>(() => ({ session: { game: restored } }));
    observeGames(store);
    const log = [
      { kind: "counter" },
      { kind: "timer", meta: { action: "respond" } },
      { kind: "timer", meta: { action: "passBack" } },
      { kind: "timer", meta: { action: "timeout" } },
    ];
    store.setState({ session: { game: { ...restored, log } } });
    store.setState({ session: { game: { ...restored, log } } });
    store.setState({ session: null });
    await flush();
    expect(logs.map((l) => l[0])).toEqual(["timer_respond", "timer_timeout"]);
  });

  it("a new game id starts fresh; a revived game can end again; no-ended games skip", async () => {
    const store = create<GameStoreLike>(() => ({
      session: { game: game({ status: "ended" }) },
    }));
    observeGames(store);
    store.setState({ session: { game: game({ status: "running" }) } }); // revived
    store.setState({ session: { game: game({ status: "ended" }) } });
    store.setState({
      session: { game: game({ id: "g2", status: "running", timer: { mode: "bank" } }) },
    });
    await flush();
    expect(logs.map((l) => l[0])).toEqual(["game_start", "game_end", "game_start"]);
    expect(logs[1]![1]).toEqual({ duration_s: 0, turns: 1 });
    expect(logs[2]![1]).toMatchObject({ timers: true, mode: "bank" });
  });

  it("drops everything without consent", async () => {
    useConsent.setState({ choice: "denied" });
    const store = create<GameStoreLike>(() => ({ session: null }));
    observeGames(store);
    store.setState({ session: { game: game({ status: "running" }) } });
    await flush();
    expect(logs).toEqual([]);
  });
});

describe("paywall and auth observers", () => {
  it("paywall_view on open", async () => {
    const store = create<PaywallLike>(() => ({ isOpen: false, feature: null }));
    observePaywall(store);
    store.setState({ isOpen: true, feature: "players7to8" });
    store.setState({ isOpen: true, feature: "players7to8" });
    store.setState({ isOpen: false, feature: null });
    store.setState({ isOpen: true, feature: null });
    await flush();
    expect(logs).toEqual([
      ["paywall_view", { feature: "players7to8" }],
      ["paywall_view", { feature: "direct" }],
    ]);
  });

  it("sign_in only for an interactive Google sign-in", async () => {
    const store = create<AuthLike>(() => ({ status: "signedOut", user: null }));
    observeAuth(store);
    store.setState({ status: "signedIn", user: { isAnonymous: false } }); // restored session
    store.setState({ status: "signingIn", user: null });
    store.setState({ status: "signedIn", user: { isAnonymous: true } });
    store.setState({ status: "signingIn", user: null });
    store.setState({ status: "signedIn", user: { isAnonymous: false } });
    await flush();
    expect(logs).toEqual([["sign_in", { method: "google" }]]);
  });
});
