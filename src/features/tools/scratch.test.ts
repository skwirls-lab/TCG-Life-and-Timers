// @req TOOL-012
import { describe, expect, it } from "vitest";
import {
  SCRATCH_LIMIT,
  SCRATCH_MAX,
  SCRATCH_MIN,
  SCRATCH_NAME_MAX,
  ScratchListSchema,
  addCounter,
  bumpCounter,
  clearCounters,
  removeCounter,
  renameCounter,
} from "./scratch";

describe("scratch counters (TOOL-012)", () => {
  it("adds, renames, bumps, clears and deletes user-named counters", () => {
    let l = addCounter([], "Ink");
    l = addCounter(l, "Damage");
    expect(l.map((c) => [c.id, c.name, c.value])).toEqual([
      ["c1", "Ink", 0],
      ["c2", "Damage", 0],
    ]);
    l = bumpCounter(l, "c1", 3);
    l = bumpCounter(l, "c2", -2);
    l = renameCounter(l, "c2", "Bench damage");
    expect(l.map((c) => [c.name, c.value])).toEqual([
      ["Ink", 3],
      ["Bench damage", -2],
    ]);
    l = clearCounters(l);
    expect(l.map((c) => c.value)).toEqual([0, 0]);
    l = removeCounter(l, "c1");
    expect(l.map((c) => c.id)).toEqual(["c2"]);
    // ids stay unique after a delete
    l = addCounter(l, "Lore");
    expect(new Set(l.map((c) => c.id)).size).toBe(2);
    expect(ScratchListSchema.safeParse(l).success).toBe(true);
  });

  it("clamps values and names and caps the list", () => {
    let l = addCounter([], "x".repeat(40));
    expect(l[0]!.name).toHaveLength(SCRATCH_NAME_MAX);
    l = bumpCounter(l, "c1", 100_000);
    expect(l[0]!.value).toBe(SCRATCH_MAX);
    l = bumpCounter(l, "c1", -100_000);
    expect(l[0]!.value).toBe(SCRATCH_MIN);
    let full = l;
    for (let i = 0; i < SCRATCH_LIMIT + 3; i++) full = addCounter(full, "n");
    expect(full).toHaveLength(SCRATCH_LIMIT);
    expect(ScratchListSchema.safeParse([{ id: "", name: "a", value: 0 }]).success).toBe(false);
  });
});
