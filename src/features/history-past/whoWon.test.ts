// @req HIST-031
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { TcgDb } from "@/lib/db";
import { listRecords } from "@/lib/records";
import { configureRecordKeeper, recordKeeperIdle } from "@/state/recordKeeper";
import { MIN, Play, T0, names } from "../../../tests/unit/helpers/records";
import { requestReset, useWhoWon } from "./whoWon";

let db: TcgDb;
let n = 0;

beforeEach(() => {
  db = new TcgDb(`whowon-${Date.now()}-${n++}`);
  configureRecordKeeper({ now: () => T0 + 60 * MIN, db: () => db, plainLog: true });
});

afterEach(async () => {
  await recordKeeperIdle();
  configureRecordKeeper();
  useWhoWon.setState({ pending: null });
  db.close();
  await db.delete();
});

function meaningful() {
  const p = new Play(names("Ana", "Ben", "Cy"));
  p.wait(MIN).life("s1", -1).wait(MIN).life("s2", -1).wait(MIN).life("s3", -1);
  return p;
}

describe("requestReset (HIST-031)", () => {
  // @req HIST-031
  it("prompts for a meaningful unresolved game; the answer is saved, then proceeds", async () => {
    const p = meaningful();
    const proceed = vi.fn();
    expect(await requestReset({ game: p.g, proceed, now: p.now })).toBe("prompt");
    expect(proceed).not.toHaveBeenCalled();
    expect(useWhoWon.getState().pending?.game.id).toBe(p.g.id);
    await useWhoWon.getState().answer({ kind: "winners", seatIds: ["s2"] });
    expect(proceed).toHaveBeenCalledTimes(1);
    const list = await listRecords({ db });
    expect(list.map((r) => r.winners)).toEqual([["s2"]]);
    // Answering again without a pending prompt does nothing.
    await useWhoWon.getState().answer({ kind: "none" });
    expect(proceed).toHaveBeenCalledTimes(1);
  });

  it("cancel closes the prompt without resetting; Don't save keeps nothing", async () => {
    const p = meaningful();
    const proceed = vi.fn();
    await requestReset({ game: p.g, proceed, now: p.now, setting: "always" });
    useWhoWon.getState().cancel();
    expect(useWhoWon.getState().pending).toBeNull();
    expect(proceed).not.toHaveBeenCalled();
    await requestReset({ game: p.g, proceed, now: p.now });
    await useWhoWon.getState().answer({ kind: "discard" });
    expect(proceed).toHaveBeenCalledTimes(1);
    expect(await listRecords({ db })).toHaveLength(0);
  });

  it("saves without asking ('never') and skips trivial games or no game", async () => {
    const p = meaningful();
    const proceed = vi.fn();
    expect(await requestReset({ game: p.g, proceed, now: p.now, setting: "never" })).toBe("save");
    expect((await listRecords({ db }))[0]!.outcome).toBe("none");
    const trivial = new Play(names("A", "B"));
    expect(await requestReset({ game: trivial.g, proceed, now: trivial.now })).toBe("skip");
    expect(await requestReset({ game: null, proceed })).toBe("skip");
    expect(proceed).toHaveBeenCalledTimes(3);
    expect(await listRecords({ db })).toHaveLength(1);
  });
});
