// @req ARCH-006 @req GAME-016
/** B-2: the store's cross-tab guard — a tab whose game was taken over stops saving; "Use here". */
import { Dexie } from "dexie";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { counterValue, seededRng } from "@/engine";
import { loadActive, saveActive, TcgDb } from "@/lib/db";
import type { ChannelLike } from "@/lib/db/tabGuard";
import { NAMES, testPreset } from "../../tests/unit/helpers/engine";
import { configureGameStore, flushAutosave, resetGameStore, useGameStore } from "./gameStore";

class FakeChannel implements ChannelLike {
  onmessage: ((ev: { data: unknown }) => void) | null = null;
  sent: unknown[] = [];
  postMessage(data: unknown) {
    this.sent.push(data);
  }
  close() {
    this.onmessage = null;
  }
}

let name: string;
let db: TcgDb;
let other: TcgDb;
let ch: FakeChannel;

beforeEach(() => {
  name = `store-multitab-${Math.random()}`;
  db = new TcgDb(name);
  other = new TcgDb(name);
  ch = new FakeChannel();
  configureGameStore({
    now: () => 1_000_000,
    rng: seededRng(9),
    db: () => db,
    autosaveMs: 10_000,
    channel: () => ch,
  });
});

afterEach(async () => {
  resetGameStore();
  db.close();
  other.close();
  await Dexie.delete(name);
});

const config = () => ({
  preset: testPreset(),
  seats: NAMES.map((n, i) => ({ id: `s${i + 1}`, name: n })),
  firstSeatId: "s1",
});
const hit = (delta: number) =>
  useGameStore.getState().dispatch({ type: "COUNTER_ADD", counterId: "life", seatId: "s2", delta });

describe("B-2 store cross-tab guard", () => {
  it("announces new / loaded games; another tab's claim makes this tab stale and stops saving", async () => {
    const g = useGameStore.getState().newGame(config());
    expect(ch.sent.at(-1)).toMatchObject({ type: "claim", gameId: g.id });
    hit(-1);
    await flushAutosave();
    // Another tab opens the same game and changes it.
    const theirs = await loadActive(other);
    ch.onmessage?.({ data: { type: "claim", tabId: "other-tab", gameId: g.id } });
    expect(useGameStore.getState().staleTab).toBe(true);
    await saveActive(
      {
        ...theirs.session!,
        game: { ...theirs.session!.game, activity: { ...theirs.session!.game.activity } },
      },
      other,
    );
    // This (stale) tab keeps being tapped: nothing is written over the other tab's state.
    hit(-5);
    await flushAutosave();
    const stored = await loadActive(other);
    expect(counterValue(stored.session!.game, "life", "s2")).toBe(19);
    // "Use here" re-loads from IndexedDB and takes over.
    const sent = ch.sent.length;
    expect(await useGameStore.getState().takeOverHere()).toBe(true);
    expect(useGameStore.getState().staleTab).toBe(false);
    expect(counterValue(useGameStore.getState().session!.game, "life", "s2")).toBe(19);
    expect(ch.sent.length).toBe(sent + 1);
  });

  it("a save that finds another tab's game active (no broadcast) keeps it and turns stale", async () => {
    useGameStore.getState().newGame(config());
    hit(-1);
    await flushAutosave();
    // Another tab starts its own game without us hearing about it.
    const rng = seededRng(4);
    const { createGame, createSession } = await import("@/engine");
    const g2 = createGame(config(), rng, 2_000_000);
    await saveActive(createSession(g2), other, { takeOver: true });
    hit(-1);
    await flushAutosave();
    expect(useGameStore.getState().staleTab).toBe(true);
    expect((await loadActive(other)).session?.game.id).toBe(g2.id);
  });

  it("claims from other tabs are ignored while this tab has no game", () => {
    ch.onmessage?.({ data: { type: "claim", tabId: "x", gameId: "g" } });
    expect(useGameStore.getState().staleTab).toBe(false);
  });

  it("without a channel the guard is inert", async () => {
    configureGameStore({ channel: () => null });
    useGameStore.getState().newGame(config());
    hit(-2);
    await vi.waitFor(async () => {
      await flushAutosave();
      expect((await loadActive(other)).session).not.toBeNull();
    });
  });
});
