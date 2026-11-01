// @vitest-environment node
// @req ARCH-002
import { describe, expect, it } from "vitest";

describe("engine purity", () => {
  it("imports and runs under plain Node with no DOM", async () => {
    expect(typeof (globalThis as { window?: unknown }).window).toBe("undefined");
    expect(typeof (globalThis as { document?: unknown }).document).toBe("undefined");
    const engine = await import("./index");
    const { commander } = await import("@/presets/mtg/presets");
    const g = engine.createGame({ preset: commander }, engine.seededRng(1), 0);
    const next = engine.reduce(
      g,
      { type: "COUNTER_ADD", counterId: "mtg.life", seatId: "s1", delta: -1, now: 1 },
      { rng: engine.cryptoRng() },
    );
    expect(engine.counterValue(next, "mtg.life", "s1")).toBe(39);
  });
});
