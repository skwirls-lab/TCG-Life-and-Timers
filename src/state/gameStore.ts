"use client";
/**
 * Game store (T1.5): a Zustand store wrapping the pure engine session reducer.
 *
 * - `dispatch(action)` injects `now` (Date.now) and the RNG (cryptoRng) — tests swap both with
 *   `configureGameStore({ now, rng, db })`.
 * - Autosave (ARCH-006): every committed change is saved to IndexedDB, debounced 250 ms, and
 *   flushed on `visibilitychange` (hidden) / `pagehide`.
 * - Keeps `useActiveGameFlag` in sync (PWA-004).
 * - Multi-tab guard (B-2): starting / loading a game announces it to other tabs (tabGuard); a tab
 *   whose game was taken over by another tab becomes `staleTab`, stops autosaving and offers
 *   "Use here" (re-load from IndexedDB and take over). Saves never delete another tab's game.
 * - Seat-scoped hooks (`useSeat`, `useGameValue`) compare selector output shallowly so a change on
 *   seat A doesn't re-render seat B (PERF-002).
 */
import { create } from "zustand";
import { useShallow } from "zustand/react/shallow";
import {
  canRedo,
  canUndo,
  createGame,
  createSession,
  cryptoRng,
  reduceSession,
  type Game,
  type GameAction,
  type GameSession,
  type NewGameConfig,
  type Rng,
  type Seat,
  type SeatId,
} from "@/engine";
import { useActiveGameFlag } from "@/lib/app/activeGame";
import { clearActive, getDb, loadActive, saveActive, type TcgDb } from "@/lib/db";
import { createTabGuard, type ChannelLike, type TabGuard } from "@/lib/db/tabGuard";

type DistributiveOmit<T, K extends PropertyKey> = T extends unknown ? Omit<T, K> : never;
/** A GameAction without `now` (the store injects it). */
export type ActionInput = DistributiveOmit<GameAction, "now">;

export interface GameStoreState {
  session: GameSession | null;
  /** 'loading' while resume() reads IndexedDB. */
  loadState: "idle" | "loading" | "loaded";
  /** Set when the stored game was corrupt and was backed up (show a notice). */
  notice: "corrupt" | null;
  /** B-2: another tab took over the active game; this tab no longer autosaves. */
  staleTab: boolean;
  /** B-2 "Use here": re-load the active game from IndexedDB and take it over in this tab. */
  takeOverHere: () => Promise<boolean>;
  dispatch: (action: ActionInput) => void;
  newGame: (config: NewGameConfig) => Game;
  /** Load the active game from IndexedDB. Resolves true when a game was restored. */
  resume: () => Promise<boolean>;
  /** Drop the active game (memory + IndexedDB). */
  clear: () => Promise<void>;
  dismissNotice: () => void;
}

interface StoreEnv {
  now: () => number;
  rng: Rng;
  db: () => TcgDb;
  autosaveMs: number;
  /** Cross-tab channel (B-2); null disables the guard. Default: BroadcastChannel in browsers. */
  channel: () => ChannelLike | null;
}

const isVitest = () =>
  typeof process !== "undefined" && typeof process.env === "object" && !!process.env.VITEST;

const defaultChannel = (): ChannelLike | null =>
  typeof window === "undefined" || typeof BroadcastChannel === "undefined" || isVitest()
    ? null
    : (new BroadcastChannel("tcg-life-active") as unknown as ChannelLike);

const defaultEnv = (): StoreEnv => ({
  now: () => Date.now(),
  rng: cryptoRng(),
  db: getDb,
  autosaveMs: 250,
  channel: defaultChannel,
});

let env: StoreEnv = defaultEnv();
let guard: TabGuard | null = null;
/** The next save takes over the shared active-game pointer (a new game in this tab). */
let takeOverNext = false;

function tabGuard(): TabGuard {
  guard ??= createTabGuard({
    channel: env.channel,
    onStale: () => {
      if (!useGameStore.getState().session) return;
      cancelPendingSave();
      useGameStore.setState({ staleTab: true });
    },
  });
  return guard;
}

export const useGameStore = create<GameStoreState>((set, get) => ({
  session: null,
  loadState: "idle",
  notice: null,
  staleTab: false,
  dispatch: (action) => {
    const s = get().session;
    if (!s) return;
    const full = { ...action, now: env.now() } as GameAction;
    const next = reduceSession(s, full, { rng: env.rng });
    if (next !== s) set({ session: next });
  },
  newGame: (config) => {
    startAutosave();
    const game = createGame(config, env.rng, env.now());
    takeOverNext = true;
    set({ session: createSession(game), loadState: "loaded", staleTab: false });
    tabGuard().claim(game.id);
    return game;
  },
  resume: async () => {
    startAutosave();
    if (get().staleTab) cancelPendingSave();
    else await flushAutosave();
    set({ loadState: "loading" });
    const r = await loadActive(env.db(), env.now());
    lastSaved = r.session?.game ?? null;
    takeOverNext = false;
    set({
      session: r.session,
      loadState: "loaded",
      staleTab: false,
      notice: r.corrupt ? "corrupt" : get().notice,
    });
    if (r.session) tabGuard().claim(r.session.game.id);
    return r.session !== null;
  },
  takeOverHere: () => get().resume(),
  clear: async () => {
    cancelPendingSave();
    set({ session: null });
    await clearActive(env.db());
  },
  dismissNotice: () => set({ notice: null }),
}));

// ---------------------------------------------------------------------------------------------
// Active-game flag + autosave
// ---------------------------------------------------------------------------------------------

/** inProgress = running, or ready with activity (PWA-004). */
export function isInProgress(game: Game | undefined): boolean {
  if (!game) return false;
  if (game.status === "running" || game.status === "paused") return true;
  return game.status === "ready" && game.activity.changes > 0;
}

let timer: ReturnType<typeof setTimeout> | null = null;
let pending: GameSession | null = null;
let unsubscribe: (() => void) | null = null;
let lastSaved: Game | null = null;

function cancelPendingSave() {
  if (timer) clearTimeout(timer);
  timer = null;
  pending = null;
}

async function save(session: GameSession) {
  if (session.game === lastSaved) return;
  // B-2: a stale tab never writes (the other tab owns the newer state).
  if (useGameStore.getState().staleTab) return;
  lastSaved = session.game;
  const takeOver = takeOverNext;
  try {
    const r = await saveActive(session, env.db(), { takeOver });
    if (takeOver) takeOverNext = false;
    if (r === "conflict") useGameStore.setState({ staleTab: true });
  } catch (e) {
    lastSaved = null;
    console.warn("[gameStore] autosave failed", e);
  }
}

/** Save any pending change now (visibilitychange/pagehide, tests). */
export async function flushAutosave(): Promise<void> {
  const s = pending;
  cancelPendingSave();
  if (s) await save(s);
}

function onVisibility() {
  if (document.visibilityState === "hidden") void flushAutosave();
}

function onPageHide() {
  void flushAutosave();
}

/** Start the persistence subscription (idempotent). Returns a stop function. */
export function startAutosave(): () => void {
  if (unsubscribe) return stopAutosave;
  const unsub = useGameStore.subscribe((state, prev) => {
    const game = state.session?.game;
    if (game === prev.session?.game) return;
    useActiveGameFlag.getState().setInProgress(isInProgress(game));
    if (!state.session) return;
    pending = state.session;
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => void flushAutosave(), env.autosaveMs);
  });
  if (typeof window !== "undefined") {
    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("pagehide", onPageHide);
  }
  unsubscribe = () => {
    unsub();
    if (typeof window !== "undefined") {
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("pagehide", onPageHide);
    }
  };
  return stopAutosave;
}

export function stopAutosave(): void {
  unsubscribe?.();
  unsubscribe = null;
  cancelPendingSave();
  guard?.close();
  guard = null;
}

/** Test hook: inject clock / rng / db / debounce. Call with no args to restore defaults. */
export function configureGameStore(overrides?: Partial<StoreEnv>): void {
  env = overrides ? { ...env, ...overrides } : defaultEnv();
}

/** Test hook: reset store state, autosave and env. */
export function resetGameStore(): void {
  stopAutosave();
  lastSaved = null;
  takeOverNext = false;
  env = defaultEnv();
  useGameStore.setState({ session: null, loadState: "idle", notice: null, staleTab: false });
  useActiveGameFlag.getState().setInProgress(false);
}

// ---------------------------------------------------------------------------------------------
// Hooks
// ---------------------------------------------------------------------------------------------

/** Select from the current game (shallow-compared). undefined when no game is loaded. */
export function useGameValue<T>(selector: (game: Game) => T): T | undefined {
  return useGameStore(useShallow((s) => (s.session ? selector(s.session.game) : undefined)));
}

/** Seat-scoped selection (PERF-002): re-renders only when the selected slice changes. */
export function useSeat<T>(seatId: SeatId, selector: (seat: Seat, game: Game) => T): T | undefined {
  return useGameStore(
    useShallow((s) => {
      const game = s.session?.game;
      const seat = game?.seats.find((x) => x.id === seatId);
      return game && seat ? selector(seat, game) : undefined;
    }),
  );
}

export function useDispatch(): GameStoreState["dispatch"] {
  return useGameStore((s) => s.dispatch);
}

export function useUndoState(): { canUndo: boolean; canRedo: boolean } {
  return useGameStore(
    useShallow((s) => ({
      canUndo: s.session ? canUndo(s.session) : false,
      canRedo: s.session ? canRedo(s.session) : false,
    })),
  );
}
