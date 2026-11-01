// @req TMR-031
import { describe, expect, it } from "vitest";
import { defaultTimerConfig, warningFor } from "@/engine";
import { MIN, SEC } from "./model";
import {
  addChoices,
  addWarning,
  presetWarnings,
  removeWarning,
  toggleWarningFlag,
  warningsSummary,
} from "./warnings";

describe("low-time warnings sub-page model", () => {
  it("adds, removes and toggles thresholds; warningsMs stays in sync", () => {
    const base = defaultTimerConfig(); // 5:00, 1:00, 0:10 (no per-threshold flags yet)
    expect(warningsSummary(base)).toBe("5:00 · 1:00 · 0:10");
    let cfg = { ...base, ...addWarning(base, 2 * MIN) };
    expect(cfg.warningsMs).toEqual([5 * MIN, 2 * MIN, MIN, 10 * SEC]);
    expect(addChoices(cfg)).not.toContain(2 * MIN);
    expect(addChoices(cfg)).toContain(30 * SEC);
    cfg = { ...cfg, ...toggleWarningFlag(cfg, MIN, "sound", false) };
    expect(warningFor(cfg, MIN)).toEqual({ ms: MIN, sound: false, vibrate: true, flash: true });
    expect(warningFor(cfg, 5 * MIN).sound).toBe(true);
    cfg = { ...cfg, ...toggleWarningFlag(cfg, 10 * SEC, "flash", false) };
    expect(warningFor(cfg, 10 * SEC).flash).toBe(false);
    cfg = { ...cfg, ...removeWarning(cfg, 5 * MIN) };
    expect(cfg.warningsMs).toEqual([2 * MIN, MIN, 10 * SEC]);
    expect(warningsSummary(cfg)).toBe("2:00 · 1:00 · 0:10");
    // Adding an existing threshold keeps one entry (and its flags).
    expect({ ...cfg, ...addWarning(cfg, MIN) }.warnings!.filter((w) => w.ms === MIN)).toEqual([
      { ms: MIN, sound: false, vibrate: true, flash: true },
    ]);
  });

  it("presets reset the list with every alert on; empty = no warnings", () => {
    const p = presetWarnings([MIN, 10 * SEC]);
    expect(p.warningsMs).toEqual([MIN, 10 * SEC]);
    expect(p.warnings!.every((w) => w.sound && w.vibrate && w.flash)).toBe(true);
    const none = { ...defaultTimerConfig(), ...presetWarnings([]) };
    expect(warningsSummary(none)).toBe("");
    expect(addChoices(none)).toHaveLength(8);
  });
});
