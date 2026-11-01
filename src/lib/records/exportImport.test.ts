// @req HIST-006
import { describe, expect, it } from "vitest";
import { MIN, Play } from "../../../tests/unit/helpers/records";
import { buildRecord } from "./build";
import {
  CSV_COLUMNS,
  csvCell,
  exportFileName,
  parseRecordsJson,
  recordsToCsv,
  recordsToJson,
} from "./exportImport";

function sample() {
  const p = new Play([
    { name: 'Ana, "the" Great', deckName: "=SUM(A1)", commanders: ["Tymna", "Thrasios"] },
    { name: "Ben" },
    { name: "Cy" },
  ]);
  p.do({ type: "SET_OPTION", key: "turnTracking", value: true });
  p.do({ type: "START_GAME" });
  p.wait(MIN).life("s2", -40);
  p.wait(MIN).life("s3", -40);
  return buildRecord(p.g, { now: p.now });
}

describe("CSV export", () => {
  // @req HIST-006
  it("writes one row per game-seat with the documented columns", () => {
    const a = sample();
    const b = { ...sample(), id: "other" };
    const csv = recordsToCsv([a, b]);
    const lines = csv.trimEnd().split("\r\n");
    expect(lines[0]).toBe(CSV_COLUMNS.join(","));
    expect(lines).toHaveLength(1 + 6);
    const first = lines[1]!;
    expect(first.startsWith(`${a.id},`)).toBe(true);
    expect(first).toContain('"Ana, ""the"" Great"');
    expect(first).toContain("'=SUM(A1)");
    expect(first).toContain("Tymna / Thrasios");
    // winner / place / starting player columns
    const cells = lines[2]!.split(",");
    const col = (name: string) => cells[CSV_COLUMNS.indexOf(name as (typeof CSV_COLUMNS)[number])];
    expect(col("player_name")).toBe("Ben");
    expect(col("winner")).toBe("0");
    expect(col("place")).toBe("3");
    expect(col("eliminated_order")).toBe("1");
    expect(col("elimination_cause")).toBe("life");
    expect(col("turn_position")).toBe("2");
    expect(col("starting_player")).toBe("0");
    expect(col("seat_index")).toBe("2");
    expect(col("ended_at")).toMatch(/^\d{4}-\d\d-\d\dT/);
  });

  it("formats cells", () => {
    expect(csvCell(undefined)).toBe("");
    expect(csvCell(null)).toBe("");
    expect(csvCell(-5)).toBe("-5");
    expect(csvCell(Number.NaN)).toBe("");
    expect(csvCell("-x")).toBe("'-x");
    expect(csvCell("a\nb")).toBe('"a\nb"');
    expect(csvCell("plain")).toBe("plain");
    const noStart = { ...sample(), startingSeatId: undefined };
    const row = recordsToCsv([noStart]).split("\r\n")[1]!.split(",");
    expect(row[CSV_COLUMNS.indexOf("starting_player")]).toBe("");
  });
});

describe("JSON export / import", () => {
  // @req HIST-006
  it("round-trips records", () => {
    const a = sample();
    const json = recordsToJson([a], 0);
    expect(JSON.parse(json).format).toBe("tcg-life-records");
    const back = parseRecordsJson(json);
    expect(back.ok).toBe(true);
    if (back.ok) {
      expect(back.records).toEqual([a]);
      expect(back.invalid).toBe(0);
    }
  });

  it("validates entries, dedupes ids, accepts bare arrays", () => {
    const a = sample();
    const res = parseRecordsJson(
      JSON.stringify([a, a, { ...a, id: "bad", endedAt: a.startedAt - 1 }, { nope: 1 }]),
    );
    expect(res).toMatchObject({ ok: true, invalid: 3 });
    if (res.ok) expect(res.records).toHaveLength(1);
    // Sync-only shapes are accepted and hydrated.
    const slim = parseRecordsJson(
      JSON.stringify([
        {
          id: "s",
          schemaVersion: 1,
          presetId: "x",
          game: "G",
          startedAt: 1,
          endedAt: 2,
          durationMs: 1,
          seats: [{ name: "A", winner: true }],
        },
      ]),
    );
    expect(slim.ok && slim.records[0]!.partial).toBe(true);
  });

  it("rejects bad files", () => {
    expect(parseRecordsJson("{")).toEqual({ ok: false, error: "json" });
    expect(parseRecordsJson('{"format":"x"}')).toEqual({ ok: false, error: "format" });
    expect(parseRecordsJson('{"format":"tcg-life-records","records":{}}')).toEqual({
      ok: false,
      error: "format",
    });
    expect(parseRecordsJson("[]")).toEqual({ ok: false, error: "empty" });
  });

  it("names files by date", () => {
    expect(exportFileName("csv", Date.UTC(2026, 10, 1))).toBe("tcg-life-games-2026-11-01.csv");
    expect(exportFileName("json", 0)).toBe("tcg-life-games-1970-01-01.json");
  });
});
