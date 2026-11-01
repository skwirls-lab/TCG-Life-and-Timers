// @req CUS-001 @req CUS-002 @req CUS-003 @req CUS-005 @req CUS-008 @req CUS-010 @req PRE-002
import { describe, expect, it } from "vitest";
import { createGame, reduce, seededRng, type CounterDefinition, type Preset } from "@/engine";
import { copyPreset } from "@/lib/customPresets";
import { BUILT_IN_PRESETS } from "@/presets";
import {
  WIN_LOSS_RULES,
  applyRule,
  autoRulesSummary,
  blankPreset,
  canCreateMore,
  counterField,
  counterHasIssues,
  issuesFor,
  linkTargets,
  moveCounter,
  newCounter,
  normalizeDraft,
  parseNumberList,
  removeCounter,
  ruleOf,
  setKind,
  setPrimary,
  setScope,
  snapshot,
  upsertCounter,
  validateDraft,
} from "./model";
import { previewBadges } from "./PreviewTile";

const W = { win: "win", lose: "lose" };
const labels = { presetName: "Lore Race", game: "Lorcana", primaryName: "Lore" };

/** Scenario 7 built with the model helpers, the way the editor UI does it. */
function loreRace(): Preset {
  let p = blankPreset(labels);
  let lore = p.counters[0]!;
  lore = { ...lore, direction: "up", start: 0, min: 0, icon: "lore" };
  lore = applyRule(lore, "winGte", 20);
  p = upsertCounter(p, lore);
  let ink = newCounter(p.counters, { baseName: "Counter" });
  ink = { ...ink, name: "Ink", icon: "droplet", resetOnTurnPass: true };
  return upsertCounter(p, ink);
}

describe("win/loss rules", () => {
  it("maps every rule to a threshold and back", () => {
    const c = blankPreset(labels).counters[0]!;
    for (const r of WIN_LOSS_RULES) expect(ruleOf(applyRule(c, r).threshold)).toBe(r);
    expect(applyRule(c, "none").threshold).toBeUndefined();
  });

  it("keeps the value when re-applying the same rule and sets auto by default", () => {
    const c = applyRule(blankPreset(labels).counters[0]!, "loseLte", -3);
    expect(applyRule(c, "loseLte").threshold).toMatchObject({ value: -3, autoApply: "auto" });
    expect(applyRule(c, "loseLte", undefined, "prompt").threshold?.autoApply).toBe("prompt");
  });

  it("picks reachable defaults from the start value", () => {
    const zero = applyRule({ ...blankPreset(labels).counters[0]!, start: 0 }, "none");
    expect(applyRule(zero, "loseLte").threshold?.value).toBe(-10);
    expect(applyRule(zero, "winGte").threshold?.value).toBe(10);
    const big = { ...zero, start: 40 };
    expect(applyRule(big, "loseLte").threshold?.value).toBe(0);
    expect(applyRule(big, "winGte").threshold?.value).toBe(80);
  });

  it("marks matrix rules perSource", () => {
    const c = setScope(newCounter([], { baseName: "C" }), "playerVsOpponent");
    expect(applyRule(c, "loseGte", 21).threshold?.perSource).toBe(true);
  });
});

describe("counter defaults by type and scope", () => {
  it("creates unique ids and names", () => {
    const a = newCounter([], { baseName: "Counter" });
    const b = newCounter([a], { baseName: "Counter" });
    expect(a.id).not.toBe(b.id);
    expect(a.name).toBe("Counter 1");
    expect(b.name).toBe("Counter 2");
    const c = newCounter([{ ...a, name: "Counter 3" }, b], { baseName: "Counter" });
    expect(c.name).toBe("Counter 4");
  });

  it("applies kind defaults", () => {
    const base = newCounter([], { baseName: "C" });
    const bool = setKind(applyRule(base, "winGte", 5), "boolean");
    expect(bool).toMatchObject({ kind: "boolean", start: 0, min: null, max: null });
    expect(bool.threshold).toBeUndefined();
    const en = setKind(base, "enum", ["Day", "Night"]);
    expect(en.enumValues).toEqual(["Day", "Night"]);
    expect(setKind(base, "enum").enumValues).toEqual(["1", "2"]);
    expect(setKind(en, "number").enumValues).toBeUndefined();
    const tok = setKind(base, "token");
    expect(tok.scope).toBe("token");
    expect(setKind(tok, "number").scope).toBe("player");
    const linked = { ...base, linkedTo: { counterId: "x", factor: -1, optional: false } };
    expect(setKind(linked, "number").linkedTo).toBeDefined();
    expect(setKind(linked, "boolean").linkedTo).toBeUndefined();
    const excl = { ...setKind(base, "boolean"), exclusiveGroup: "g" };
    expect(setKind(excl, "boolean").exclusiveGroup).toBe("g");
  });

  it("applies scope defaults", () => {
    const base = newCounter([], { baseName: "C", kind: "enum", scope: "global" });
    expect(base).toMatchObject({ kind: "enum", scope: "global" });
    const tok = setScope(base, "token");
    expect(tok.kind).toBe("token");
    const back = setScope(tok, "player");
    expect(back.kind).toBe("number");
    const pvo = setScope(applyRule(back, "loseGte", 21), "playerVsOpponent");
    expect(pvo).toMatchObject({ sourcesPerOpponent: 1, resetOnTurnPass: false });
    expect(pvo.threshold?.perSource).toBe(true);
    const unmatrix = setScope(pvo, "player");
    expect(unmatrix.sourcesPerOpponent).toBeUndefined();
    expect(unmatrix.threshold?.perSource).toBeUndefined();
    expect(setScope({ ...back, isPrimary: true }, "global").isPrimary).toBe(false);
  });

  it("primary toggles board visibility and category", () => {
    const c = newCounter([], { baseName: "C" });
    const on = setPrimary(c, true);
    expect(on).toMatchObject({ isPrimary: true, visibility: "board", category: "score" });
    expect(setPrimary({ ...c, direction: "down" }, true).category).toBe("life");
    const off = setPrimary(on, false);
    expect(off.isPrimary).toBeUndefined();
    expect(off.visibility).toBe("badge");
    expect(setPrimary({ ...c, visibility: "panel" }, false).visibility).toBe("panel");
  });
});

describe("list operations (CUS-010)", () => {
  it("moves counters and ignores out-of-range moves", () => {
    const p = loreRace();
    const moved = moveCounter(p, 1, 0);
    expect(moved.counters.map((c) => c.name)).toEqual(["Ink", "Lore"]);
    expect(moveCounter(p, 0, 5)).toBe(p);
    expect(moveCounter(p, 0, 0)).toBe(p);
    expect(moveCounter(p, -1, 0)).toBe(p);
  });

  it("removes counters and links pointing at them", () => {
    let p = loreRace();
    const ink = p.counters[1]!;
    const dmg: CounterDefinition = {
      ...newCounter(p.counters, { baseName: "Dmg" }),
      linkedTo: { counterId: ink.id, factor: -1, optional: false },
    };
    p = upsertCounter(p, dmg);
    expect(linkTargets(p, dmg.id).map((c) => c.id)).toEqual([p.counters[0]!.id, ink.id]);
    const removed = removeCounter(p, ink.id);
    expect(removed.counters).toHaveLength(2);
    expect(removed.counters[1]!.linkedTo).toBeUndefined();
  });
});

describe("validation mapped to fields (CUS-005)", () => {
  it("Scenario 7 draft is valid, normalizes and plays to a win", () => {
    const p = loreRace();
    const v = validateDraft(p, W);
    expect(v).toEqual({ ok: true, issues: [], other: [] });
    const n = normalizeDraft(p, W);
    expect(n.rulesSummary).toBe("Lore ≥ 20: win.");
    expect(n.capabilities).toContain("perTurnFlags");
    let g = createGame({ preset: n, players: 2 }, seededRng(1), 0);
    const seat = g.seats[0]!.id;
    for (let i = 0; i < 20; i++)
      g = reduce(
        g,
        { type: "COUNTER_ADD", counterId: "primary", seatId: seat, delta: 1, now: i + 1 },
        {
          rng: seededRng(2),
        },
      );
    expect(g.status).toBe("ended");
    expect(g.result?.winners).toEqual([seat]);
  });

  it("flags two primaries", () => {
    let p = loreRace();
    p = upsertCounter(p, setPrimary(p.counters[1]!, true));
    const v = validateDraft(p, W);
    expect(v.ok).toBe(false);
    expect(issuesFor(v, "primary")[0]).toMatchObject({
      message: "builder.err.manyPrimaries",
      vars: { count: 2 },
    });
    const none = upsertCounter(p, setPrimary(p.counters[0]!, false));
    const none2 = upsertCounter(none, setPrimary(none.counters[1]!, false));
    expect(issuesFor(validateDraft(none2, W), "primary")[0]?.message).toBe("builder.err.noPrimary");
    expect(issuesFor(validateDraft({ ...p, counters: [] }, W), "primary")[0]?.message).toBe(
      "builder.err.noCounters",
    );
  });

  it("flags start outside min/max on the start field", () => {
    const p = loreRace();
    const bad = upsertCounter(p, { ...p.counters[1]!, start: -1 });
    const v = validateDraft(bad, W);
    expect(issuesFor(v, counterField(p.counters[1]!.id, "start"))[0]?.message).toBe(
      "builder.err.startRange",
    );
    expect(counterHasIssues(v, p.counters[1]!.id)).toBe(true);
    expect(counterHasIssues(v, p.counters[0]!.id)).toBe(false);
  });

  it("flags every field rule", () => {
    const p = loreRace();
    const [lore, ink] = p.counters as [CounterDefinition, CounterDefinition];
    const cases: [Preset, string, string][] = [
      [{ ...p, name: " " }, "name", "builder.err.nameRequired"],
      [{ ...p, game: "" }, "game", "builder.err.gameRequired"],
      [{ ...p, minPlayers: 0 }, "players", "builder.err.playersRange"],
      [{ ...p, minPlayers: 4, maxPlayers: 2 }, "players", "builder.err.playersMinMax"],
      [{ ...p, defaultPlayers: 6, maxPlayers: 4 }, "players", "builder.err.playersDefault"],
      [{ ...p, rulesUrl: "not a url" }, "rulesUrl", "builder.err.url"],
      [{ ...p, rulesUrl: "ftp://x.y" }, "rulesUrl", "builder.err.url"],
      [{ ...p, quickStartValues: [-5, 10] }, "quickStart", "builder.err.quickStart"],
      [
        upsertCounter(p, { ...ink, name: "" }),
        counterField(ink.id, "name"),
        "builder.err.nameRequired",
      ],
      [
        upsertCounter(p, { ...ink, name: "lore" }),
        counterField(ink.id, "name"),
        "builder.err.duplicateName",
      ],
      [
        upsertCounter(p, { ...ink, shortName: "TOOLONG" }),
        counterField(ink.id, "shortName"),
        "builder.err.shortName",
      ],
      [upsertCounter(p, { ...ink, step: 0 }), counterField(ink.id, "step"), "builder.err.step"],
      [
        upsertCounter(p, { ...ink, holdStep: -1 }),
        counterField(ink.id, "step"),
        "builder.err.step",
      ],
      [
        upsertCounter(p, { ...ink, min: 5, max: 1 }),
        counterField(ink.id, "range"),
        "builder.err.minMax",
      ],
      [
        upsertCounter(p, { ...ink, max: -1, min: null }),
        counterField(ink.id, "start"),
        "builder.err.startRange",
      ],
      [
        upsertCounter(p, { ...setKind(ink, "enum"), enumValues: ["Only"] }),
        counterField(ink.id, "enum"),
        "builder.err.enumValues",
      ],
      [
        upsertCounter(p, { ...lore, threshold: { ...lore.threshold!, value: Number.NaN } }),
        counterField(lore.id, "threshold"),
        "builder.err.threshold",
      ],
      [
        upsertCounter(p, { ...lore, max: 10 }),
        counterField(lore.id, "threshold"),
        "builder.err.unreachable",
      ],
      [
        upsertCounter(p, applyRule(ink, "loseLte", -1)),
        counterField(ink.id, "threshold"),
        "builder.err.unreachable",
      ],
      [
        upsertCounter(p, applyRule(ink, "loseGte", 0)),
        counterField(ink.id, "threshold"),
        "builder.err.metAtStart",
      ],
      [
        upsertCounter(p, {
          ...ink,
          linkedTo: { counterId: "missing", factor: 1, optional: false },
        }),
        counterField(ink.id, "link"),
        "builder.err.link",
      ],
      [
        upsertCounter(p, { ...ink, linkedTo: { counterId: lore.id, factor: 0, optional: false } }),
        counterField(ink.id, "link"),
        "builder.err.linkFactor",
      ],
      [
        upsertCounter(p, { ...lore, scope: "global" }),
        counterField(lore.id, "primary"),
        "builder.err.primaryKind",
      ],
    ];
    for (const [draft, field, message] of cases) {
      const v = validateDraft(draft, W);
      expect(v.ok, `${field} ${message}`).toBe(false);
      expect(
        issuesFor(v, field).map((i) => i.message),
        `${field} ${message}`,
      ).toContain(message);
    }
  });

  it("surfaces schema/semantic errors not mapped to a field", () => {
    const p = loreRace();
    const bad = upsertCounter(p, { ...p.counters[1]!, exclusiveGroup: "x" });
    const v = validateDraft(bad, W);
    expect(v.ok).toBe(false);
    expect(v.issues).toEqual([]);
    expect(v.other.join(" ")).toMatch(/exclusiveGroup/);
  });

  it("every duplicated built-in validates in the editor (PRE-002)", () => {
    for (const b of BUILT_IN_PRESETS) {
      const v = validateDraft(copyPreset(b), W);
      expect(v.ok, `${b.id}: ${JSON.stringify(v)}`).toBe(true);
    }
  });
});

describe("normalize and helpers", () => {
  it("trims, drops empty optionals and keeps a summary", () => {
    const p = loreRace();
    const n = normalizeDraft(
      {
        ...p,
        name: "  Lore Race ",
        rulesUrl: " ",
        format: "",
        quickStartValues: [],
        rulesSummary: "  Custom ",
        counters: [
          { ...p.counters[0]!, shortName: " ", description: " " },
          { ...setKind(p.counters[1]!, "enum", [" A ", "B"]), resetOnTurnPass: false },
        ],
      },
      W,
    );
    expect(n.name).toBe("Lore Race");
    expect(n.rulesUrl).toBeUndefined();
    expect(n.format).toBeUndefined();
    expect(n.quickStartValues).toBeUndefined();
    expect(n.rulesSummary).toBe("Custom");
    expect(n.counters[0]!.shortName).toBeUndefined();
    expect(n.counters[0]!.description).toBeUndefined();
    expect(n.counters[1]!.enumValues).toEqual(["A", "B"]);
    expect(n.counters[1]!.resetOnTurnPass).toBeUndefined();
    const kept = normalizeDraft({ ...p, rulesUrl: " https://x.y/r ", format: "Std" }, W);
    expect(kept.rulesUrl).toBe("https://x.y/r");
    expect(kept.format).toBe("Std");
    expect(
      normalizeDraft({ ...p, counters: [{ ...p.counters[0]!, shortName: " L " }] }, W).counters[0]!
        .shortName,
    ).toBe("L");
  });

  it("auto summary covers lose rules and falls back to the name", () => {
    const p = blankPreset(labels);
    expect(autoRulesSummary(p, W)).toBe("Lore ≤ 0: lose.");
    const none = upsertCounter(p, applyRule(p.counters[0]!, "none"));
    expect(autoRulesSummary(none, W)).toBe("Lore Race");
    expect(autoRulesSummary({ ...none, name: "" }, W)).toBe("—");
  });

  it("parses number lists, gates the free limit and snapshots", () => {
    expect(parseNumberList("20, 25;30  x 40")).toEqual([20, 25, 30, 40]);
    expect(canCreateMore(0, 1)).toBe(true);
    expect(canCreateMore(1, 1)).toBe(false);
    expect(canCreateMore(99, Number.POSITIVE_INFINITY)).toBe(true);
    const p = loreRace();
    expect(snapshot(p)).toBe(snapshot(structuredClone(p)));
  });

  it("preview badges list enabled badge counters with hidden-at-start state (CUS-004)", () => {
    const p = loreRace();
    const ink = p.counters[1]!;
    expect(previewBadges(p)).toEqual([{ counter: ink, hidden: true }]);
    const shown = upsertCounter(p, { ...ink, showWhenDefault: true });
    expect(previewBadges(shown)[0]!.hidden).toBe(false);
    expect(previewBadges(upsertCounter(p, { ...ink, visibility: "panel" }))).toEqual([]);
  });
});
