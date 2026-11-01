// @req ARCH-006 @req PERF-002 @req PWA-004
import { act, render } from "@testing-library/react";
import { Dexie } from "dexie";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { counterValue, seededRng } from "@/engine";
import { useActiveGameFlag } from "@/lib/app/activeGame";
import { loadActive, TcgDb } from "@/lib/db";
import { NAMES, testPreset } from "../../tests/unit/helpers/engine";
import {
  configureGameStore,
  flushAutosave,
  isInProgress,
  resetGameStore,
  startAutosave,
  useDispatch,
  useGameStore,
  useGameValue,
  useSeat,
  useUndoState,
} from "./gameStore";

let db: TcgDb;
let clock = 1_000_000;
let saves = 0;

beforeEach(() => {
  db = new TcgDb(`store-${Math.random()}`);
  saves = 0;
  db.games.hook("creating", () => {
    saves++;
  });
  db.games.hook("updating", () => {
    saves++;
  });
  clock = 1_000_000;
  configureGameStore({ now: () => clock, rng: seededRng(9), db: () => db, autosaveMs: 30 });
});

afterEach(async () => {
  resetGameStore();
  db.close();
  await Dexie.delete(db.name);
});

const config = () => ({
  preset: testPreset(),
  seats: NAMES.map((name, i) => ({ id: `s${i + 1}`, name })),
  firstSeatId: "s1",
});

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

describe("gameStore", () => {
  it("newGame + dispatch inject now and rng", () => {
    const g = useGameStore.getState().newGame(config());
    expect(g.createdAt).toBe(1_000_000);
    clock = 1_000_500;
    useGameStore
      .getState()
      .dispatch({ type: "COUNTER_ADD", counterId: "life", seatId: "s1", delta: -2 });
    const game = useGameStore.getState().session!.game;
    expect(counterValue(game, "life", "s1")).toBe(18);
    expect(game.log.at(-1)!.at).toBe(1_000_500);
    const before = useGameStore.getState().session;
    useGameStore
      .getState()
      .dispatch({ type: "COUNTER_ADD", counterId: "nope", seatId: "s1", delta: 1 });
    expect(useGameStore.getState().session).toBe(before);
    useGameStore.getState().dispatch({ type: "UNDO" });
    expect(counterValue(useGameStore.getState().session!.game, "life", "s1")).toBe(20);
  });

  it("dispatch without a session is a no-op", () => {
    useGameStore.getState().dispatch({ type: "PASS_TURN" });
    expect(useGameStore.getState().session).toBeNull();
  });

  // @req ARCH-006
  it("autosaves debounced (one write for a burst) and resume() restores it", async () => {
    useGameStore.getState().newGame(config());
    for (let i = 0; i < 5; i++) {
      clock += 100;
      useGameStore
        .getState()
        .dispatch({ type: "COUNTER_ADD", counterId: "life", seatId: "s2", delta: -1 });
    }
    expect(saves).toBe(0);
    await sleep(120);
    expect(saves).toBe(1);
    const saved = await loadActive(db);
    expect(counterValue(saved.session!.game, "life", "s2")).toBe(15);
    // resume in a fresh store
    useGameStore.setState({ session: null });
    expect(await useGameStore.getState().resume()).toBe(true);
    expect(counterValue(useGameStore.getState().session!.game, "life", "s2")).toBe(15);
    expect(useGameStore.getState().loadState).toBe("loaded");
  });

  // @req ARCH-006
  it("flushes on visibilitychange (hidden) and pagehide", async () => {
    configureGameStore({ autosaveMs: 60_000 });
    useGameStore.getState().newGame(config());
    useGameStore
      .getState()
      .dispatch({ type: "COUNTER_ADD", counterId: "life", seatId: "s1", delta: -1 });
    Object.defineProperty(document, "visibilityState", { value: "visible", configurable: true });
    document.dispatchEvent(new Event("visibilitychange"));
    await sleep(20);
    expect(saves).toBe(0);
    Object.defineProperty(document, "visibilityState", { value: "hidden", configurable: true });
    document.dispatchEvent(new Event("visibilitychange"));
    await sleep(30);
    expect(saves).toBe(1);
    clock += 5000;
    useGameStore
      .getState()
      .dispatch({ type: "COUNTER_ADD", counterId: "life", seatId: "s3", delta: -1 });
    window.dispatchEvent(new Event("pagehide"));
    await sleep(30);
    expect(saves).toBe(2);
    await flushAutosave(); // nothing pending
    expect(saves).toBe(2);
    Object.defineProperty(document, "visibilityState", { value: "visible", configurable: true });
  });

  it("autosave failures are reported and retried on the next change", async () => {
    useGameStore.getState().newGame(config());
    await flushAutosave();
    const broken = new TcgDb(`broken-${Math.random()}`);
    broken.close();
    configureGameStore({
      db: () =>
        ({ ...broken, transaction: () => Promise.reject(new Error("quota")) }) as unknown as TcgDb,
    });
    const warn = console.warn;
    const warnings: unknown[] = [];
    console.warn = (...a: unknown[]) => warnings.push(a);
    try {
      useGameStore
        .getState()
        .dispatch({ type: "COUNTER_ADD", counterId: "life", seatId: "s1", delta: -1 });
      await flushAutosave();
      expect(warnings).toHaveLength(1);
    } finally {
      console.warn = warn;
    }
  });

  it("resume reports a corrupt stored game and clear() removes it", async () => {
    useGameStore.getState().newGame(config());
    await flushAutosave();
    const id = useGameStore.getState().session!.game.id;
    await db.games.update(id, { game: { broken: true } as never });
    useGameStore.setState({ session: null });
    expect(await useGameStore.getState().resume()).toBe(false);
    expect(useGameStore.getState().notice).toBe("corrupt");
    useGameStore.getState().dismissNotice();
    expect(useGameStore.getState().notice).toBeNull();
    useGameStore.getState().newGame(config());
    await flushAutosave();
    await useGameStore.getState().clear();
    expect(useGameStore.getState().session).toBeNull();
    expect((await loadActive(db)).session).toBeNull();
  });

  // @req PWA-004
  it("keeps the active-game flag in sync", () => {
    startAutosave();
    useGameStore.getState().newGame(config());
    expect(useActiveGameFlag.getState().inProgress).toBe(false);
    useGameStore
      .getState()
      .dispatch({ type: "COUNTER_ADD", counterId: "life", seatId: "s1", delta: -1 });
    expect(useActiveGameFlag.getState().inProgress).toBe(true);
    useGameStore.getState().dispatch({ type: "END_GAME", winners: ["s1"] });
    expect(useActiveGameFlag.getState().inProgress).toBe(false);
    expect(isInProgress(undefined)).toBe(false);
    const g = useGameStore.getState().session!.game;
    expect(isInProgress({ ...g, status: "running" })).toBe(true);
    expect(isInProgress({ ...g, status: "paused" })).toBe(true);
  });
});

describe("seat-scoped hooks", () => {
  // @req PERF-002
  it("a change on seat A does not re-render seat B", () => {
    useGameStore.getState().newGame(config());
    const renders: Record<string, number> = { s1: 0, s2: 0, header: 0 };
    function SeatTile({ id }: { id: string }) {
      const view = useSeat(id, (seat, game) => ({
        name: seat.name,
        life: counterValue(game, "life", seat.id),
      }));
      renders[id]!++;
      return <div data-testid={id}>{`${view?.name}:${view?.life}`}</div>;
    }
    function Header() {
      const turn = useGameValue((g) => g.turn.turnNumber);
      const undo = useUndoState();
      const dispatch = useDispatch();
      renders.header!++;
      return (
        <button
          onClick={() => dispatch({ type: "PASS_TURN" })}
        >{`${turn}:${String(undo.canUndo)}`}</button>
      );
    }
    const { getByTestId } = render(
      <>
        <Header />
        <SeatTile id="s1" />
        <SeatTile id="s2" />
      </>,
    );
    expect(renders).toEqual({ s1: 1, s2: 1, header: 1 });
    act(() => {
      useGameStore
        .getState()
        .dispatch({ type: "COUNTER_ADD", counterId: "life", seatId: "s1", delta: -3 });
    });
    expect(getByTestId("s1").textContent).toBe("Bethany:17");
    expect(renders.s1).toBe(2);
    expect(renders.s2).toBe(1);
    expect(renders.header).toBe(2); // canUndo flipped
    act(() => {
      clock += 5000;
      useGameStore
        .getState()
        .dispatch({ type: "COUNTER_ADD", counterId: "life", seatId: "s1", delta: -1 });
    });
    expect(renders.s2).toBe(1);
    expect(renders.header).toBe(2);
  });

  it("hooks return undefined without a game", () => {
    function Probe() {
      const v = useGameValue((g) => g.id);
      const s = useSeat("s1", (seat) => seat.name);
      return <span data-testid="p">{`${String(v)}|${String(s)}`}</span>;
    }
    const { getByTestId } = render(<Probe />);
    expect(getByTestId("p").textContent).toBe("undefined|undefined");
  });
});
