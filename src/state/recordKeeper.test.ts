// @req HIST-003 @req HIST-008 @req HIST-031 @req HIST-032
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { seededRng } from "@/engine";
import { TcgDb } from "@/lib/db";
import { listRecords } from "@/lib/records";
import { getBuiltInPreset } from "@/presets";
import { configureGameStore, resetGameStore, useGameStore } from "./gameStore";
import {
  configureRecordKeeper,
  finalizeBeforeReset,
  historyVisible,
  markHandled,
  recordKeeperIdle,
  startRecordKeeper,
  stopRecordKeeper,
} from "./recordKeeper";

type Input = Parameters<ReturnType<typeof useGameStore.getState>["dispatch"]>[0];

const T0 = Date.UTC(2026, 9, 1, 18);
let clock = T0;
let db: TcgDb;
let n = 0;

function newGame(names = ["Ana", "Ben", "Cy"]) {
  return useGameStore.getState().newGame({
    preset: getBuiltInPreset("mtg.commander")!,
    seats: names.map((name) => ({ name })),
  });
}

function act(...actions: Input[]) {
  for (const a of actions) {
    clock += 10_000;
    useGameStore.getState().dispatch(a);
  }
}

const seat = (i: number) => useGameStore.getState().session!.game.seats[i]!.id;
const lifeLoss = (i: number, delta = -40): Input => ({
  type: "COUNTER_ADD",
  counterId: "mtg.life",
  seatId: seat(i),
  delta,
});

beforeEach(() => {
  db = new TcgDb(`keeper-${Date.now()}-${n++}`);
  clock = T0;
  configureGameStore({ now: () => clock, rng: seededRng(5), db: () => db, autosaveMs: 100_000 });
  configureRecordKeeper({ now: () => clock, db: () => db, plainLog: true });
});

afterEach(async () => {
  stopRecordKeeper();
  await recordKeeperIdle();
  resetGameStore();
  configureRecordKeeper();
  db.close();
  await db.delete();
});

describe("record keeper", () => {
  // @req HIST-003
  it("saves a record when the game ends (once, also after a reload)", async () => {
    startRecordKeeper(useGameStore);
    expect(startRecordKeeper(useGameStore)).toBe(startRecordKeeper(useGameStore));
    newGame();
    act(lifeLoss(1));
    act(lifeLoss(2));
    expect(useGameStore.getState().session!.game.status).toBe("ended");
    await recordKeeperIdle();
    let list = await listRecords({ db });
    expect(list).toHaveLength(1);
    expect(list[0]!.winners).toEqual([seat(0)]);
    expect(list[0]!.log?.startsWith("{")).toBe(true);
    // A restore of the same ended game (keeper restarted) keeps the single record.
    stopRecordKeeper();
    startRecordKeeper(useGameStore);
    await recordKeeperIdle();
    list = await listRecords({ db });
    expect(list).toHaveLength(1);
    // Undo the end, play on, end again → the record is replaced with the new ending.
    act({ type: "UNDO" } as Input);
    expect(useGameStore.getState().session!.game.status).not.toBe("ended");
    act(lifeLoss(2));
    await recordKeeperIdle();
    list = await listRecords({ db });
    expect(list).toHaveLength(1);
    expect(list[0]!.endedAt).toBe(clock);
  });

  // @req HIST-032
  it("saves an unfinished game replaced without the Who-won flow; discards trivial ones", async () => {
    startRecordKeeper(useGameStore);
    newGame();
    act(lifeLoss(0, -3), lifeLoss(1, -2));
    act({ type: "RESET_GAME" } as Input);
    await recordKeeperIdle();
    let list = await listRecords({ db });
    expect(list).toHaveLength(1);
    expect(list[0]!.outcome).toBe("none");
    // Trivial game replaced → nothing saved.
    newGame();
    await recordKeeperIdle();
    list = await listRecords({ db });
    expect(list).toHaveLength(1);
  });

  // @req HIST-031
  it("finalizeBeforeReset saves the decision and stops the keeper from saving again", async () => {
    startRecordKeeper(useGameStore);
    newGame();
    act(lifeLoss(0, -3), lifeLoss(1, -2), lifeLoss(2, -1));
    const game = useGameStore.getState().session!.game;
    const rec = await finalizeBeforeReset(game, { kind: "winners", seatIds: [seat(1)] });
    expect(rec?.winners).toEqual([seat(1)]);
    act({ type: "RESET_GAME" } as Input);
    await recordKeeperIdle();
    const list = await listRecords({ db });
    expect(list).toHaveLength(1);
    expect(list[0]!.winners).toEqual([game.seats[1]!.id]);
  });

  it("does not save for 'Don't save', trivial auto, or history off", async () => {
    startRecordKeeper(useGameStore);
    newGame();
    act(lifeLoss(0, -3), lifeLoss(1, -2), lifeLoss(2, -1));
    expect(
      await finalizeBeforeReset(useGameStore.getState().session!.game, { kind: "discard" }),
    ).toBeNull();
    act({ type: "RESET_GAME" } as Input);
    expect(
      await finalizeBeforeReset(useGameStore.getState().session!.game, { kind: "auto" }),
    ).toBeNull();
    // History off: neither the end nor a replacement is recorded (HIST-008).
    newGame();
    act({ type: "SET_OPTION", key: "historyEnabled", value: false } as Input);
    expect(historyVisible({}, useGameStore.getState().session!.game)).toBe(false);
    act(lifeLoss(1), lifeLoss(2));
    expect(useGameStore.getState().session!.game.status).toBe("ended");
    newGame();
    act(lifeLoss(0, -3));
    act({ type: "SET_OPTION", key: "historyEnabled", value: false } as Input);
    expect(
      await finalizeBeforeReset(useGameStore.getState().session!.game, { kind: "none" }),
    ).toBeNull();
    newGame();
    await recordKeeperIdle();
    expect(await listRecords({ db })).toHaveLength(0);
  });

  it("skips games marked as handled and saves an ended game present at start", async () => {
    newGame();
    act(lifeLoss(1), lifeLoss(2));
    startRecordKeeper(useGameStore);
    await recordKeeperIdle();
    expect(await listRecords({ db })).toHaveLength(1);
    newGame();
    act(lifeLoss(0, -3));
    markHandled(useGameStore.getState().session!.game.id);
    newGame();
    await recordKeeperIdle();
    expect(await listRecords({ db })).toHaveLength(1);
  });
});
