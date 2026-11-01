// @req ARCH-006 @req GAME-016 @req REL-001
/** B-2: two tabs (two Dexie connections to one database) never delete each other's game. */
import { afterEach, describe, expect, it } from "vitest";
import { Dexie } from "dexie";
import { createSession, reduceSession, seededRng, type GameSession } from "@/engine";
import { newGame, T0 } from "../../../tests/unit/helpers/engine";
import { clearActive, loadActive, ownedActiveId, saveActive, TcgDb } from "./index";
import { createTabGuard, TAB_CHANNEL, type ChannelLike, type TabClaim } from "./tabGuard";

const names: string[] = [];
const dbs: TcgDb[] = [];
afterEach(async () => {
  for (const d of dbs.splice(0)) d.close();
  for (const n of names.splice(0)) await Dexie.delete(n);
});

function tabs(): [TcgDb, TcgDb] {
  const name = `multitab-${Math.random()}`;
  names.push(name);
  const a = new TcgDb(name);
  const b = new TcgDb(name);
  dbs.push(a, b);
  return [a, b];
}

function played(seed: number, delta: number): GameSession {
  const rng = seededRng(seed);
  let s = createSession(newGame({ id: `g${seed}` }, rng));
  s = reduceSession(s, { type: "START_GAME", now: T0 + 1 }, { rng });
  return reduceSession(
    s,
    { type: "COUNTER_ADD", counterId: "life", seatId: "s2", delta, now: T0 + 2 },
    { rng },
  );
}

describe("B-2 two tabs on /play (repo)", () => {
  it("a second tab's game survives the first tab's next autosave", async () => {
    const [tabA, tabB] = tabs();
    const a = played(1, -5);
    expect(await saveActive(a, tabA)).toBe("saved");
    const b = played(2, -9);
    // Tab B starts another game (a new game in that tab takes over the pointer).
    expect(await saveActive(b, tabB, { takeOver: true })).toBe("saved");
    // Tab A keeps autosaving: it must not delete g2 nor repoint the active game.
    expect(await saveActive(a, tabA)).toBe("conflict");
    expect(await tabB.games.get("g2")).toBeDefined();
    expect(await tabA.games.get("g1")).toBeDefined(); // A's progress is kept too (no loss)
    const resumed = await loadActive(tabB, T0);
    expect(resumed.session?.game.id).toBe("g2");
  });

  it("taking over never deletes the other tab's row; a reset in the owning tab drops its own", async () => {
    const [tabA, tabB] = tabs();
    await saveActive(played(1, -1), tabA);
    expect(ownedActiveId(tabA)).toBe("g1");
    expect(ownedActiveId(tabB)).toBeUndefined();
    await saveActive(played(2, -1), tabB, { takeOver: true });
    expect(await tabA.games.get("g1")).toBeDefined();
    // Tab B resets (new id): its own replaced row g2 is dropped, g1 (tab A's) is untouched.
    await saveActive(played(3, -1), tabB);
    expect(await tabB.games.get("g2")).toBeUndefined();
    expect(await tabB.games.get("g1")).toBeDefined();
    expect((await loadActive(tabA, T0)).session?.game.id).toBe("g3");
    expect(ownedActiveId(tabA)).toBe("g3");
  });

  it("a fresh connection that never loaded does not delete the active game", async () => {
    const [tabA, tabB] = tabs();
    await saveActive(played(1, -1), tabA);
    expect(await saveActive(played(2, -1), tabB)).toBe("conflict");
    expect((await loadActive(tabA, T0)).session?.game.id).toBe("g1");
  });

  it("clearActive in a stale tab leaves the other tab's active game", async () => {
    const [tabA, tabB] = tabs();
    await saveActive(played(1, -1), tabA);
    await saveActive(played(2, -1), tabB, { takeOver: true });
    await clearActive(tabA);
    expect(await tabA.games.get("g1")).toBeUndefined();
    expect((await loadActive(tabB, T0)).session?.game.id).toBe("g2");
    await clearActive(tabB);
    expect((await loadActive(tabB, T0)).session).toBeNull();
  });
});

/** In-memory BroadcastChannel stand-in: every channel of a bus gets the others' messages. */
class FakeBus {
  channels = new Set<FakeChannel>();
  open(): FakeChannel {
    const c = new FakeChannel(this);
    this.channels.add(c);
    return c;
  }
}
class FakeChannel implements ChannelLike {
  onmessage: ((ev: { data: unknown }) => void) | null = null;
  closed = false;
  constructor(private bus: FakeBus) {}
  postMessage(data: unknown) {
    if (this.closed) throw new Error("closed");
    for (const c of this.bus.channels) if (c !== this) c.onmessage?.({ data });
  }
  close() {
    this.closed = true;
    this.bus.channels.delete(this);
  }
}

describe("B-2 tab guard (BroadcastChannel)", () => {
  it("uses the documented channel name", () => {
    expect(TAB_CHANNEL).toBe("tcg-life-active");
  });

  it("a claim from another tab marks this tab stale; own and malformed messages are ignored", () => {
    const bus = new FakeBus();
    const staleA: TabClaim[] = [];
    const staleB: TabClaim[] = [];
    const a = createTabGuard({
      tabId: "A",
      channel: () => bus.open(),
      onStale: (c) => staleA.push(c),
    });
    const chB = bus.open();
    const b = createTabGuard({ tabId: "B", channel: () => chB, onStale: (c) => staleB.push(c) });
    b.claim("g2");
    expect(staleA).toEqual([{ type: "claim", tabId: "B", gameId: "g2" }]);
    expect(staleB).toEqual([]);
    chB.onmessage?.({ data: { type: "claim", tabId: "B", gameId: "x" } }); // own id
    chB.onmessage?.({ data: "junk" });
    chB.onmessage?.({ data: { type: "claim", tabId: 3 } });
    expect(staleB).toEqual([]);
    a.claim("g1");
    expect(staleB).toHaveLength(1);
    a.close();
    a.close();
    b.claim("g3"); // A closed: no delivery
    expect(staleA).toHaveLength(1);
  });

  it("is a no-op without BroadcastChannel or when the channel throws", () => {
    const g1 = createTabGuard({ channel: () => null, onStale: () => undefined });
    g1.claim("g");
    g1.close();
    const g2 = createTabGuard({
      channel: () => {
        throw new Error("blocked");
      },
      onStale: () => undefined,
    });
    g2.claim("g");
    const bus = new FakeBus();
    const ch = bus.open();
    const g3 = createTabGuard({ channel: () => ch, onStale: () => undefined });
    ch.closed = true;
    expect(() => g3.claim("g")).not.toThrow();
  });
});
