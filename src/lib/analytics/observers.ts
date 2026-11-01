/**
 * Derives §19.5 events from app stores so feature code needs no analytics calls for them:
 * game_start / game_end / timer_respond / timer_timeout (game store), paywall_view (paywall store)
 * and sign_in (auth store). Every event goes through `track()`, which drops it without consent.
 * Stores are passed in (structural types) so this module imports none of them.
 */
import { track } from "./telemetry";

interface StoreApi<S> {
  getState: () => S;
  subscribe: (fn: (state: S, prev: S) => void) => () => void;
}

/** The slice of an engine `Game` the observers read. */
export interface ObservedGame {
  id: string;
  status: string;
  startedAt?: number;
  endedAt?: number;
  preset: { id: string };
  seats: readonly unknown[];
  turn: { turnNumber: number };
  timer: { mode: string };
  log: readonly { kind: string; meta?: Record<string, unknown> }[];
}

export interface GameStoreLike {
  session: { game: ObservedGame } | null;
}

const LIVE = new Set(["running", "paused"]);

export function observeGames(store: StoreApi<GameStoreLike>): () => void {
  const started = new Set<string>();
  const ended = new Set<string>();
  const initial = store.getState().session?.game;
  // A game restored mid-play was already counted when it started (on that earlier visit).
  if (initial && LIVE.has(initial.status)) started.add(initial.id);
  if (initial?.status === "ended") ended.add(initial.id);
  let seen = initial ? { id: initial.id, len: initial.log.length } : null;

  return store.subscribe((state) => {
    const g = state.session?.game;
    if (!g) return;
    if (LIVE.has(g.status) && !started.has(g.id)) {
      started.add(g.id);
      track("game_start", {
        preset: g.preset.id,
        players: g.seats.length,
        timers: g.timer.mode !== "off",
        mode: g.timer.mode,
      });
    }
    if (g.status === "ended" && !ended.has(g.id)) {
      ended.add(g.id);
      const ms = g.endedAt && g.startedAt ? g.endedAt - g.startedAt : 0;
      track("game_end", {
        duration_s: Math.max(0, Math.round(ms / 1000)),
        turns: g.turn.turnNumber,
      });
    }
    if (g.status !== "ended") ended.delete(g.id); // a revived game can end again (D-025)
    const from = seen && seen.id === g.id ? seen.len : g.log.length;
    for (let i = from; i < g.log.length; i++) {
      const ev = g.log[i]!;
      if (ev.kind !== "timer") continue;
      if (ev.meta?.action === "respond") track("timer_respond");
      else if (ev.meta?.action === "timeout") track("timer_timeout");
    }
    seen = { id: g.id, len: g.log.length };
  });
}

export interface PaywallLike {
  isOpen: boolean;
  feature: string | null;
}

export function observePaywall(store: StoreApi<PaywallLike>): () => void {
  return store.subscribe((s, prev) => {
    if (s.isOpen && !prev.isOpen) track("paywall_view", { feature: s.feature ?? "direct" });
  });
}

export interface AuthLike {
  status: string;
  user: { isAnonymous: boolean } | null;
}

export function observeAuth(store: StoreApi<AuthLike>): () => void {
  return store.subscribe((s, prev) => {
    if (prev.status === "signingIn" && s.status === "signedIn" && s.user && !s.user.isAnonymous) {
      track("sign_in", { method: "google" });
    }
  });
}
