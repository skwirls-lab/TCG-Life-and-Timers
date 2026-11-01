// @req HIST-003 @req HIST-030 @req HIST-032
import { describe, expect, it } from "vitest";
import { gameDataSchema } from "@/lib/firebase/docs";
import { MIN, Play, T0, names } from "../../../tests/unit/helpers/records";
import {
  activeTime,
  assignPlaces,
  buildRecord,
  causeKind,
  createRecord,
  pauseIntervals,
  resolveOutcome,
  shouldDiscard,
} from "./build";
import { decodeLog, encodeLog, gunzipBase64, gzipBase64 } from "./compress";
import { identityOf, isDefaultIdentity, isDefaultName, profileIdOf } from "./identity";

const SEC = 1000;

/** A 4-player Commander game: JP takes commander damage, Josh dies first, Conner second. */
function commanderGame() {
  const p = new Play([
    { name: "Bethany", profileId: "prof-beth", deckId: "deck-1", deckName: "Toxrill" },
    { name: "JP", commanders: ["Atraxa"] },
    { name: "Conner", commanders: ["Kaalia"] },
    { name: "Josh" },
  ]);
  p.do({ type: "SET_OPTION", key: "turnTracking", value: true });
  p.wait(10 * SEC).do({ type: "START_GAME" });
  p.wait(60 * SEC).do({ type: "PASS_TURN" }); // s1 → s2
  p.wait(60 * SEC).do({
    type: "CMD_DAMAGE_ADD",
    targetSeatId: "s1",
    sourceSeatId: "s3",
    sourceIndex: 0,
    delta: 7,
  });
  p.wait(30 * SEC).do({ type: "PASS_TURN" }); // s2 → s3
  p.wait(30 * SEC).life("s4", -40); // Josh out
  p.wait(30 * SEC).do({ type: "PASS_TURN" }); // s3 → s1 (s4 skipped)
  p.wait(30 * SEC).do({
    type: "COUNTER_ADD",
    counterId: "mtg.poison",
    seatId: "s3",
    delta: 10,
  }); // Conner out (poison)
  p.wait(30 * SEC).life("s2", -40); // JP out → Bethany wins
  return p;
}

describe("buildRecord", () => {
  // @req HIST-003
  it("captures players, positions, eliminations, places and results", () => {
    const p = commanderGame();
    expect(p.g.status).toBe("ended");
    const r = buildRecord(p.g, { now: p.now + 5000 });
    expect(r.id).toBe(p.g.id);
    expect(r.schemaVersion).toBe(1);
    expect(r.presetId).toBe("mtg.commander");
    expect(r.game).toBe("Magic: The Gathering");
    expect(r.presetName).toBe("Commander");
    expect(r.playerCount).toBe(4);
    expect(r.startValue).toBe(40);
    expect(r.startedAt).toBe(T0 + 10 * SEC);
    expect(r.endedAt).toBe(p.g.endedAt);
    expect(r.wallMs).toBe(r.endedAt - r.startedAt);
    expect(r.outcome).toBe("win");
    expect(r.winners).toEqual(["s1"]);
    expect(r.startingSeatId).toBe("s1");
    expect(r.players.map((x) => x.turnPosition)).toEqual([1, 2, 3, 4]);
    expect(r.eliminations.map((e) => [e.seatId, e.causeKind])).toEqual([
      ["s4", "life"],
      ["s3", "poison"],
      ["s2", "life"],
    ]);
    expect(r.eliminations[1]!.counterName).toBe("Poison");
    expect(r.players.map((x) => x.place)).toEqual([1, 2, 3, 4]);
    expect(r.players.map((x) => x.eliminatedOrder)).toEqual([undefined, 3, 2, 1]);
    const beth = r.players[0]!;
    expect(beth.identity).toBe("p:prof-beth");
    expect(beth.deckName).toBe("Toxrill");
    expect(beth.primary).toBe(33);
    expect(beth.finals["mtg.life"]).toBe(33);
    expect(r.players[1]!.identity).toBe("n:jp");
    expect(r.players[1]!.commanders).toEqual(["Atraxa"]);
    expect(r.players[2]!.commanderDamageDealt).toBe(7);
    expect(r.commanderDamage).toEqual([{ from: "s3", to: "s1", amount: 7 }]);
    expect(r.turns).toBeGreaterThanOrEqual(4);
    expect(r.turnTracking).toBe(true);
    // Clock stats with turn tracking only: wall time between turn events.
    expect(beth.clock?.avgTurnMs).toBe(60 * SEC);
    expect(beth.clock?.usedMs).toBe(0);
    expect(r.config?.options.turnTracking).toBe(true);
    // The D-013 sync shape (users/{uid}/games) validates.
    const pick = {
      schemaVersion: r.schemaVersion,
      presetId: r.presetId,
      game: r.game,
      startedAt: r.startedAt,
      endedAt: r.endedAt,
      durationMs: r.durationMs,
      seats: r.seats,
    };
    expect(gameDataSchema.safeParse(pick).success).toBe(true);
    expect(r.seats[0]).toEqual({
      name: "Bethany",
      profileId: "prof-beth",
      deckId: "deck-1",
      deckName: "Toxrill",
      winner: true,
      place: 1,
    });
  });

  // @req HIST-030
  it("Scenario 11: an idle gap of 2 h is excluded from the active duration", () => {
    const p = new Play(names("Ana", "Ben"), {}, "mtg.constructed");
    p.wait(MIN).life("s1", -3);
    p.wait(MIN).life("s2", -4);
    p.wait(2 * 60 * MIN).life("s1", -5); // left idle 2 h
    p.wait(MIN).life("s2", -16); // Ben 0 → Ana wins
    expect(p.g.status).toBe("ended");
    const r = buildRecord(p.g, { now: p.now });
    expect(r.wallMs).toBeGreaterThanOrEqual(2 * 60 * MIN);
    // 1 min + 1 min + (2 h excluded) + 1 min, from creation (T0)
    expect(r.durationMs).toBe(3 * MIN);
    // Configurable gap: with a 3 h gap the idle time counts.
    expect(buildRecord(p.g, { now: p.now, idleGapMs: 3 * 60 * MIN }).durationMs).toBe(123 * MIN);
  });

  // @req HIST-030
  it("excludes clock pauses and counts the tail up to `now` for unfinished games", () => {
    const p = new Play(names("Ana", "Ben"), { timer: { mode: "bank", bankMs: 30 * MIN } });
    p.do({ type: "START_GAME" });
    p.wait(2 * MIN).do({ type: "TIMER_PAUSE", reason: "user" });
    p.wait(10 * MIN).do({ type: "TIMER_RESUME" });
    p.wait(3 * MIN).life("s1", -2);
    const g = p.g;
    expect(pauseIntervals(g.log, p.now)).toEqual([[T0 + 2 * MIN, T0 + 12 * MIN]]);
    expect(activeTime(g, p.now)).toBe(5 * MIN);
    // Tail: 4 more minutes before the reset.
    expect(activeTime(g, p.now + 4 * MIN)).toBe(9 * MIN);
    // An idle tail is not counted.
    expect(activeTime(g, p.now + 60 * MIN)).toBe(5 * MIN);
    // A pause still open at the end runs to the end.
    p.do({ type: "TIMER_PAUSE", reason: "background" });
    expect(activeTime(p.g, p.now + 5 * MIN)).toBe(5 * MIN);
    // Menu pauses are play time.
    const q = new Play(names("A", "B"), { timer: { mode: "bank" } });
    q.do({ type: "START_GAME" });
    q.wait(MIN).do({ type: "TIMER_PAUSE", reason: "menu" });
    q.wait(MIN).do({ type: "TIMER_RESUME" });
    expect(activeTime(q.g, q.now)).toBe(2 * MIN);
  });

  it("counts batched updates as input times", () => {
    const p = new Play(names("A", "B"));
    p.wait(MIN).life("s1", -1);
    const g = p.g;
    const last = g.log.at(-1)!;
    const batched = {
      ...g,
      log: [...g.log.slice(0, -1), { ...last, updatedAt: last.at + 20 * MIN }],
    };
    // at → updatedAt is 20 min (> idle gap) so only the first minute counts.
    expect(activeTime(batched, last.at + 20 * MIN)).toBe(MIN);
    expect(activeTime({ ...g, log: [] }, p.now)).toBe(0);
  });

  it("records per-seat clock stats: used time, average turn, responses and timeouts", () => {
    const p = new Play(names("Ana", "Ben", "Cy"), {
      timer: { mode: "bank", bankMs: 10 * MIN, timeoutAction: "lose", warningsMs: [] },
    });
    p.do({ type: "START_GAME" });
    p.wait(30 * SEC).do({ type: "TIMER_RESPOND", seatId: "s3" });
    p.wait(20 * SEC).do({ type: "TIMER_PASS_BACK", seatId: "s3" });
    p.wait(40 * SEC).do({ type: "PASS_TURN" }); // Ana held 70 s
    p.wait(10 * MIN + SEC).do({ type: "TIMER_TIMEOUT", seatId: "s2" }); // Ben flags
    const r = buildRecord(p.g, { now: p.now });
    const [ana, ben, cy] = r.players;
    expect(r.timerMode).toBe("bank");
    expect(ana!.clock!.usedMs).toBe(70 * SEC);
    expect(ana!.clock!.avgTurnMs).toBe(70 * SEC);
    expect(ana!.clock!.timedTurns).toBe(1);
    expect(cy!.clock!.responses).toBe(1);
    expect(cy!.clock!.responseMs).toBe(20 * SEC);
    // Cy also holds for the second after Ben's exact 10:00 timeout.
    expect(cy!.clock!.usedMs).toBe(21 * SEC);
    expect(ben!.clock!.timeouts).toBe(1);
    expect(r.eliminations[0]).toMatchObject({ seatId: "s2", causeKind: "time" });
  });

  it("leaves turn positions unset while the first player is still to be chosen", () => {
    const p = new Play(names("A", "B"), {
      options: { firstPlayerRule: "choose" },
      firstSeatId: undefined,
    });
    const r = buildRecord(p.g, { now: p.now });
    expect(r.startingSeatId).toBeUndefined();
    expect(r.players.every((x) => x.turnPosition === undefined)).toBe(true);
    expect(r.players[0]!.clock).toBeUndefined();
    expect(r.outcome).toBe("none");
    expect(r.players.every((x) => x.place === undefined)).toBe(true);
  });

  it("applies Who-won decisions", () => {
    const p = new Play(names("A", "B", "C"));
    p.wait(MIN).life("s3", -40);
    expect(resolveOutcome(p.g)).toEqual({ winners: [], outcome: "none" });
    const won = buildRecord(p.g, {
      now: p.now,
      decision: { kind: "winners", seatIds: ["s2", "zz"] },
    });
    expect(won.winners).toEqual(["s2"]);
    expect(won.players.map((x) => x.place)).toEqual([2, 1, 3]);
    expect(resolveOutcome(p.g, { kind: "winners", seatIds: [] }).outcome).toBe("none");
    const draw = buildRecord(p.g, { now: p.now, decision: { kind: "draw" } });
    expect(draw.outcome).toBe("draw");
    expect(draw.players.map((x) => x.place)).toEqual([1, 1, 3]);
    expect(resolveOutcome(p.g, { kind: "none" }).outcome).toBe("none");
    expect(resolveOutcome(p.g, { kind: "discard" }).outcome).toBe("none");
    // Engine draw: ended with no winners.
    const q = new Play(names("A", "B"));
    q.wait(MIN).do({ type: "END_GAME", winners: [] });
    expect(resolveOutcome(q.g).outcome).toBe("draw");
  });

  it("classifies elimination causes", () => {
    const p = new Play(names("A", "B", "C", "D"));
    p.wait(SEC).do({ type: "CONCEDE", seatId: "s1" });
    p.wait(SEC).do({ type: "ELIMINATE", seatId: "s2" });
    p.wait(SEC).do({
      type: "CMD_DAMAGE_ADD",
      targetSeatId: "s3",
      sourceSeatId: "s4",
      sourceIndex: 0,
      delta: 21,
    });
    const r = buildRecord(p.g, { now: p.now });
    expect(r.eliminations.map((e) => e.causeKind)).toEqual(["concede", "manual", "commander"]);
    expect(r.eliminations[2]!.sourceSeatId).toBe("s4");
    expect(r.winners).toEqual(["s4"]);
    expect(causeKind(p.g, { kind: "threshold", counterId: "mtg.tax" })).toBe("counter");
    expect(causeKind(p.g, { kind: "threshold", counterId: "nope" })).toBe("counter");
    expect(causeKind(p.g, { kind: "time" })).toBe("time");
  });

  it("truncates long names and keeps endedAt ≥ startedAt", () => {
    const long = "X".repeat(50);
    const p = new Play([{ name: long, deckName: "D".repeat(70) }, { name: "B" }]);
    const r = buildRecord({ ...p.g, startedAt: T0 + MIN }, { now: T0 });
    expect(r.seats[0]!.name).toHaveLength(40);
    expect(r.seats[0]!.deckName).toHaveLength(60);
    expect(r.endedAt).toBe(r.startedAt);
  });

  it("assigns places", () => {
    const base = buildRecord(new Play(names("A", "B", "C")).g, { now: T0 }).players;
    const placed = assignPlaces(
      base.map((x, i) => (i === 0 ? { ...x, winner: true } : x)),
      "win",
    );
    expect(placed.map((x) => x.place)).toEqual([1, 2, 2]);
  });
});

describe("shouldDiscard (HIST-032)", () => {
  // @req HIST-032
  it("discards trivial games only", () => {
    const p = new Play(names("A", "B"));
    expect(shouldDiscard(p.g, p.now + 30 * SEC)).toBe(true);
    p.wait(30 * SEC).do({ type: "SEAT_RENAME", seatId: "s1", name: "Ann" });
    expect(shouldDiscard(p.g, p.now)).toBe(true);
    const q = new Play(names("A", "B"));
    q.wait(10 * SEC).life("s1", -1);
    expect(shouldDiscard(q.g, q.now)).toBe(false);
    const r = new Play(names("A", "B"));
    r.wait(SEC).do({ type: "ELIMINATE", seatId: "s1" });
    expect(shouldDiscard(r.g, r.now)).toBe(false);
    // ≥ 1 minute of activity without changes is kept.
    const s = new Play(names("A", "B"));
    s.do({ type: "SET_OPTION", key: "turnTracking", value: true });
    s.wait(SEC).do({ type: "START_GAME" });
    s.wait(70 * SEC).do({ type: "PASS_TURN" });
    expect(shouldDiscard(s.g, s.now)).toBe(false);
  });
});

describe("log compression", () => {
  // @req HIST-003
  it("round-trips the snapshot through gzip + base64", async () => {
    const p = commanderGame();
    const r = await createRecord(p.g, { now: p.now });
    expect(r.log?.startsWith("H4sI")).toBe(true);
    expect(r.logTruncated).toBeUndefined();
    expect(r.log!.length).toBeLessThan(JSON.stringify(p.g).length);
    expect(await decodeLog(r.log)).toEqual(p.g);
    expect(await gunzipBase64(await gzipBase64("héllo ✓"))).toBe("héllo ✓");
  });

  it("falls back to plain JSON and decodes it", async () => {
    const p = commanderGame();
    const r = await createRecord(p.g, { now: p.now, encode: { plain: true } });
    expect(r.log?.startsWith("{")).toBe(true);
    expect(await decodeLog(r.log)).toEqual(p.g);
  });

  it("truncates the oldest events when over the size cap", async () => {
    const p = commanderGame();
    const full = await encodeLog(p.g, { plain: true });
    const { log, truncated } = await encodeLog(p.g, {
      plain: true,
      maxBytes: full.log!.length - 200,
    });
    expect(truncated).toBe(true);
    const back = await decodeLog(log);
    expect(back!.log.length).toBeLessThan(p.g.log.length);
    expect(back!.log.at(-1)).toEqual(p.g.log.at(-1));
    // Too small even with an empty log: no log at all.
    expect(await encodeLog(p.g, { plain: true, maxBytes: 10 })).toEqual({ truncated: true });
  });

  it("returns null for missing or unreadable logs", async () => {
    expect(await decodeLog(undefined)).toBeNull();
    expect(await decodeLog("not json")).toBeNull();
    expect(await decodeLog('{"v":2}')).toBeNull();
    expect(await decodeLog("H4sIgarbage")).toBeNull();
  });
});

describe("identity (HIST-033)", () => {
  // @req HIST-033
  it("groups by profile id, else normalized name; detects default names", () => {
    expect(identityOf({ name: "  Declan  " })).toBe("n:declan");
    expect(identityOf({ name: "DECLAN" })).toBe(identityOf({ name: "declan" }));
    expect(identityOf({ name: "Declan", profileId: "p1" })).toBe("p:p1");
    expect(isDefaultName("Player 3")).toBe(true);
    expect(isDefaultName(" player  12 ")).toBe(true);
    expect(isDefaultName("Player Three")).toBe(false);
    expect(isDefaultIdentity("n:player 2")).toBe(true);
    expect(isDefaultIdentity("p:player 2")).toBe(false);
    expect(profileIdOf("p:abc")).toBe("abc");
    expect(profileIdOf("n:abc")).toBeUndefined();
  });
});
