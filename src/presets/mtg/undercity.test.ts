// @vitest-environment node
// @req TOK-002
import { describe, expect, it } from "vitest";
import { createGame, enumLabel, reduce, seededRng, value, counterKey } from "@/engine";
import { getBuiltInPreset } from "@/presets";

describe("Undercity room progress (TOK-002)", () => {
  it("is an optional per-player enum that advances room by room", () => {
    const preset = getBuiltInPreset("mtg.commander")!;
    const def = preset.counters.find((c) => c.id === "mtg.undercity")!;
    expect(def.kind).toBe("enum");
    expect(def.enabledByDefault).toBe(false);
    const rng = seededRng(1);
    let g = createGame({ preset, players: 2 }, rng, 0);
    g = reduce(g, { type: "COUNTER_ENABLE", counterId: def.id, enabled: true, now: 1 }, { rng });
    const seat = g.seats[0]!.id;
    const before = value(g, counterKey(def.id, seat));
    g = reduce(g, { type: "ENUM_NEXT", counterId: def.id, seatId: seat, now: 2 }, { rng });
    expect(value(g, counterKey(def.id, seat))).toBe(before + 1);
    expect(typeof enumLabel(def, value(g, counterKey(def.id, seat)))).toBe("string");
  });
});
