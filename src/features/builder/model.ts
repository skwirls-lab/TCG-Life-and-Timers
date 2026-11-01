/**
 * Custom preset editor model (T3.6): pure helpers over a draft `Preset` — counter defaults by
 * type/scope, win/loss rule mapping, primary/reorder/remove, and field-level validation for
 * inline errors (CUS-001..005, CUS-008, CUS-010). The UI never branches on a game (ARCH-003).
 */
import { nanoid } from "nanoid";
import {
  ICON_IDS,
  defaultTimerConfig,
  type AutoKOMode,
  type CounterDefinition,
  type CounterKind,
  type CounterScope,
  type IconId,
  type Preset,
  type ThresholdRule,
} from "@/engine";
import { newCustomPresetId, toCustom, validateCustomPreset } from "@/lib/customPresets";
import type { MessageKey } from "@/lib/i18n";

export const SHORT_NAME_MAX = 6;
export const MAX_COUNTERS = 24;

// ---------------------------------------------------------------------------------------------
// Win/loss rule (CUS-002)
// ---------------------------------------------------------------------------------------------

export const WIN_LOSS_RULES = ["none", "loseLte", "loseGte", "winGte", "winLte"] as const;
export type WinLossRule = (typeof WIN_LOSS_RULES)[number];

const RULE_SHAPE: Record<
  Exclude<WinLossRule, "none">,
  Pick<ThresholdRule, "comparator" | "outcome">
> = {
  loseLte: { comparator: "<=", outcome: "lose" },
  loseGte: { comparator: ">=", outcome: "lose" },
  winGte: { comparator: ">=", outcome: "win" },
  winLte: { comparator: "<=", outcome: "win" },
};

export function ruleOf(t: ThresholdRule | undefined): WinLossRule {
  if (!t) return "none";
  if (t.outcome === "lose") return t.comparator === "<=" ? "loseLte" : "loseGte";
  return t.comparator === ">=" ? "winGte" : "winLte";
}

/** A sensible default threshold value for a rule, given the counter's start/direction. */
function defaultRuleValue(c: CounterDefinition, rule: Exclude<WinLossRule, "none">): number {
  const cmp = RULE_SHAPE[rule].comparator;
  if (cmp === "<=") return c.start > 0 ? 0 : c.start - 10;
  return c.start < 10 ? Math.max(10, c.start + 10) : c.start * 2;
}

export function applyRule(
  c: CounterDefinition,
  rule: WinLossRule,
  value?: number,
  autoApply?: AutoKOMode,
): CounterDefinition {
  const { threshold: prev, ...rest } = c;
  if (rule === "none") return rest;
  const next: ThresholdRule = {
    ...RULE_SHAPE[rule],
    value: value ?? (prev && ruleOf(prev) === rule ? prev.value : defaultRuleValue(c, rule)),
    autoApply: autoApply ?? prev?.autoApply ?? "auto",
  };
  if (c.scope === "playerVsOpponent") next.perSource = true;
  return { ...rest, threshold: next };
}

// ---------------------------------------------------------------------------------------------
// Counter defaults by type and scope
// ---------------------------------------------------------------------------------------------

/** Icons offered by the picker (engine ICON_IDS: the schema only accepts these). */
export const PICKER_ICONS: readonly IconId[] = ICON_IDS;

function uniqueCounterId(existing: readonly CounterDefinition[]): string {
  const ids = new Set(existing.map((c) => c.id));
  let id = `c-${nanoid(6)}`;
  while (ids.has(id)) id = `c-${nanoid(6)}`;
  return id;
}

function uniqueName(base: string, existing: readonly CounterDefinition[]): string {
  const names = new Set(existing.map((c) => c.name.trim().toLowerCase()));
  for (let i = existing.length + 1; ; i++) {
    const name = `${base} ${i}`;
    if (!names.has(name.toLowerCase())) return name;
  }
}

/** A new optional counter (badge, counts up from 0). */
export function newCounter(
  existing: readonly CounterDefinition[],
  opts: { baseName: string; kind?: CounterKind; scope?: CounterScope },
): CounterDefinition {
  let c: CounterDefinition = {
    id: uniqueCounterId(existing),
    name: uniqueName(opts.baseName, existing),
    icon: "star",
    kind: "number",
    scope: "player",
    category: "other",
    start: 0,
    min: 0,
    max: null,
    step: 1,
    holdStep: 5,
    direction: "up",
    visibility: "badge",
    enabledByDefault: true,
  };
  if (opts.scope) c = setScope(c, opts.scope);
  if (opts.kind) c = setKind(c, opts.kind);
  return c;
}

/** Change the type, keeping the counter consistent (token kind ⇔ token scope). */
export function setKind(
  c: CounterDefinition,
  kind: CounterKind,
  enumDefaults: readonly string[] = ["1", "2"],
): CounterDefinition {
  const { enumValues: _e, enumCycleFrom: _f, threshold, exclusiveGroup, linkedTo, ...rest } = c;
  const base: CounterDefinition = { ...rest, kind };
  switch (kind) {
    case "number":
      return {
        ...base,
        scope: base.scope === "token" ? "player" : base.scope,
        ...(threshold ? { threshold } : {}),
        ...(linkedTo ? { linkedTo } : {}),
      };
    case "boolean":
      return {
        ...base,
        scope: base.scope === "token" || base.scope === "playerVsOpponent" ? "player" : base.scope,
        start: 0,
        min: null,
        max: null,
        isPrimary: false,
        ...(exclusiveGroup ? { exclusiveGroup } : {}),
      };
    case "enum":
      return {
        ...base,
        scope: base.scope === "token" || base.scope === "playerVsOpponent" ? "player" : base.scope,
        enumValues: c.enumValues?.length ? c.enumValues : [...enumDefaults],
        start: 0,
        min: null,
        max: null,
        isPrimary: false,
      };
    case "token":
      return { ...base, scope: "token", start: 0, min: null, max: null, isPrimary: false };
  }
}

/** Change the scope (Each player / from each opponent / shared / one holder). */
export function setScope(c: CounterDefinition, scope: CounterScope): CounterDefinition {
  const { sourcesPerOpponent: _s, ...rest } = c;
  let next: CounterDefinition = { ...rest, scope };
  if (scope === "token") return setKind(next, "token");
  if (c.kind === "token") next = setKind({ ...next, kind: "number" }, "number");
  if (scope === "playerVsOpponent") {
    next = setKind(next, "number");
    next = { ...next, sourcesPerOpponent: 1, resetOnTurnPass: false, isPrimary: false };
    if (next.threshold) next.threshold = { ...next.threshold, perSource: true };
  } else if (next.threshold?.perSource) {
    const { perSource: _p, ...t } = next.threshold;
    next.threshold = t;
  }
  if (scope === "global") next.isPrimary = false;
  return next;
}

/** Toggle primary. Validation (not this helper) enforces "exactly one primary" (CUS-005). */
export function setPrimary(c: CounterDefinition, on: boolean): CounterDefinition {
  if (on) {
    return {
      ...c,
      isPrimary: true,
      visibility: "board",
      enabledByDefault: true,
      category: c.category === "other" ? (c.direction === "down" ? "life" : "score") : c.category,
    };
  }
  const { isPrimary: _p, ...rest } = c;
  return { ...rest, visibility: c.visibility === "board" ? "badge" : c.visibility };
}

/** Put `counter` in the preset (replace by id or append). */
export function upsertCounter(p: Preset, counter: CounterDefinition): Preset {
  const i = p.counters.findIndex((c) => c.id === counter.id);
  const counters = [...p.counters];
  if (i >= 0) counters[i] = counter;
  else counters.push(counter);
  return { ...p, counters };
}

/** Remove a counter and any links that point at it. */
export function removeCounter(p: Preset, id: string): Preset {
  return {
    ...p,
    counters: p.counters
      .filter((c) => c.id !== id)
      .map((c) => {
        if (c.linkedTo?.counterId !== id) return c;
        const { linkedTo: _l, ...rest } = c;
        return rest;
      }),
  };
}

/** CUS-010: move a counter (ordering defines badge and panel order). Out-of-range is a no-op. */
export function moveCounter(p: Preset, from: number, to: number): Preset {
  if (from === to || from < 0 || to < 0 || from >= p.counters.length || to >= p.counters.length)
    return p;
  const counters = [...p.counters];
  const [item] = counters.splice(from, 1);
  counters.splice(to, 0, item!);
  return { ...p, counters };
}

/** Counters another counter may link to (player-scope number counters other than itself). */
export function linkTargets(p: Preset, id: string): CounterDefinition[] {
  return p.counters.filter((c) => c.id !== id && c.scope === "player" && c.kind === "number");
}

// ---------------------------------------------------------------------------------------------
// Drafts
// ---------------------------------------------------------------------------------------------

export interface BlankLabels {
  presetName: string;
  game: string;
  primaryName: string;
}

/** A new draft: one primary counter (counts down from 20, lose at ≤ 0). */
export function blankPreset(labels: BlankLabels): Preset {
  const primary: CounterDefinition = {
    id: "primary",
    name: labels.primaryName,
    icon: "heart",
    kind: "number",
    scope: "player",
    category: "life",
    isPrimary: true,
    start: 20,
    min: null,
    max: null,
    step: 1,
    holdStep: 10,
    direction: "down",
    threshold: { comparator: "<=", value: 0, outcome: "lose", autoApply: "auto" },
    visibility: "board",
    enabledByDefault: true,
  };
  return {
    id: newCustomPresetId(),
    version: 1,
    name: labels.presetName,
    game: labels.game,
    description: "",
    rulesSummary: "",
    minPlayers: 1,
    maxPlayers: 6,
    defaultPlayers: 2,
    counters: [primary],
    capabilities: [],
    defaults: { timer: defaultTimerConfig(), firstPlayerRule: "random" },
    builtIn: false,
  };
}

const CMP_TEXT = { "<=": "≤", ">=": "≥" } as const;

/** Generated rules summary from the win/loss rules ("Lore ≥ 20: win."). */
export function autoRulesSummary(p: Preset, words: { win: string; lose: string }): string {
  const parts = p.counters
    .filter((c) => c.threshold)
    .map(
      (c) =>
        `${c.name.trim()} ${CMP_TEXT[c.threshold!.comparator]} ${c.threshold!.value}: ${
          c.threshold!.outcome === "win" ? words.win : words.lose
        }.`,
    );
  return parts.join(" ") || p.name.trim() || "—";
}

/** Clean a draft before validating/saving (trim, empty optional strings, derived capabilities). */
export function normalizeDraft(p: Preset, words: { win: string; lose: string }): Preset {
  const counters = p.counters.map((c) => {
    const out: CounterDefinition = { ...c, name: c.name.trim() };
    const short = c.shortName?.trim();
    if (short) out.shortName = short;
    else delete out.shortName;
    if (out.description !== undefined && !out.description.trim()) delete out.description;
    if (out.kind === "enum") out.enumValues = (out.enumValues ?? []).map((v) => v.trim());
    if (!out.resetOnTurnPass) delete out.resetOnTurnPass;
    return out;
  });
  const draft: Preset = {
    ...p,
    name: p.name.trim(),
    game: p.game.trim(),
    description: p.description.trim(),
    counters,
  };
  const url = p.rulesUrl?.trim();
  if (url) draft.rulesUrl = url;
  else delete draft.rulesUrl;
  if (!p.format?.trim()) delete draft.format;
  if (!draft.quickStartValues?.length) delete draft.quickStartValues;
  draft.rulesSummary = p.rulesSummary.trim() || autoRulesSummary(draft, words);
  return toCustom(draft);
}

// ---------------------------------------------------------------------------------------------
// Validation mapped to fields (CUS-005)
// ---------------------------------------------------------------------------------------------

export interface DraftIssue {
  /** "name", "players", "primary", or `c:<counterId>:<field>`. */
  field: string;
  message: MessageKey;
  vars?: Record<string, string | number>;
}

export interface DraftValidation {
  ok: boolean;
  issues: DraftIssue[];
  /** Schema/semantic errors not covered by a field check (shown raw in the summary). */
  other: string[];
}

export const counterField = (id: string, field: string) => `c:${id}:${field}`;

const isSet = (v: number | null | undefined): v is number => v !== undefined && v !== null;

function isUrl(s: string): boolean {
  try {
    const u = new URL(s);
    return u.protocol === "http:" || u.protocol === "https:";
  } catch {
    return false;
  }
}

function counterIssues(c: CounterDefinition, p: Preset, push: (i: DraftIssue) => void): void {
  const f = (field: string) => counterField(c.id, field);
  if (!c.name.trim()) push({ field: f("name"), message: "builder.err.nameRequired" });
  else if (
    p.counters.some((o) => o !== c && o.name.trim().toLowerCase() === c.name.trim().toLowerCase())
  )
    push({ field: f("name"), message: "builder.err.duplicateName" });
  if ((c.shortName?.trim().length ?? 0) > SHORT_NAME_MAX)
    push({
      field: f("shortName"),
      message: "builder.err.shortName",
      vars: { max: SHORT_NAME_MAX },
    });
  if (!Number.isFinite(c.step) || c.step <= 0)
    push({ field: f("step"), message: "builder.err.step" });
  if (c.holdStep !== undefined && (!Number.isFinite(c.holdStep) || c.holdStep <= 0))
    push({ field: f("step"), message: "builder.err.step" });
  if (c.kind === "number") {
    if (isSet(c.min) && isSet(c.max) && c.min > c.max)
      push({ field: f("range"), message: "builder.err.minMax" });
    else if ((isSet(c.min) && c.start < c.min) || (isSet(c.max) && c.start > c.max))
      push({ field: f("start"), message: "builder.err.startRange" });
  }
  if (c.kind === "enum") {
    const values = c.enumValues ?? [];
    if (values.length < 2 || values.some((v) => !v.trim()))
      push({ field: f("enum"), message: "builder.err.enumValues" });
  }
  const t = c.threshold;
  if (t) {
    if (!Number.isFinite(t.value))
      push({ field: f("threshold"), message: "builder.err.threshold" });
    else if (
      t.comparator === "<=" ? isSet(c.min) && c.min > t.value : isSet(c.max) && c.max < t.value
    )
      push({ field: f("threshold"), message: "builder.err.unreachable" });
    else if (
      c.scope !== "playerVsOpponent" &&
      (t.comparator === "<=" ? c.start <= t.value : c.start >= t.value)
    )
      push({ field: f("threshold"), message: "builder.err.metAtStart" });
  }
  if (c.linkedTo) {
    const target = p.counters.find((o) => o.id === c.linkedTo!.counterId);
    if (!target || target.scope !== "player" || target.kind !== "number" || target.id === c.id)
      push({ field: f("link"), message: "builder.err.link" });
    else if (!Number.isFinite(c.linkedTo.factor) || c.linkedTo.factor === 0)
      push({ field: f("link"), message: "builder.err.linkFactor" });
  }
  if (c.isPrimary && (c.scope !== "player" || c.kind !== "number"))
    push({ field: f("primary"), message: "builder.err.primaryKind" });
}

/** Field errors for inline display, plus any remaining schema/semantic errors (CUS-005). */
export function validateDraft(p: Preset, words: { win: string; lose: string }): DraftValidation {
  const issues: DraftIssue[] = [];
  const push = (i: DraftIssue) => issues.push(i);
  if (!p.name.trim()) push({ field: "name", message: "builder.err.nameRequired" });
  if (!p.game.trim()) push({ field: "game", message: "builder.err.gameRequired" });
  const ints = [p.minPlayers, p.maxPlayers, p.defaultPlayers];
  if (ints.some((v) => !Number.isInteger(v) || v < 1 || v > 8))
    push({ field: "players", message: "builder.err.playersRange" });
  else if (p.minPlayers > p.maxPlayers)
    push({ field: "players", message: "builder.err.playersMinMax" });
  else if (p.defaultPlayers < p.minPlayers || p.defaultPlayers > p.maxPlayers)
    push({ field: "players", message: "builder.err.playersDefault" });
  if (p.rulesUrl?.trim() && !isUrl(p.rulesUrl.trim()))
    push({ field: "rulesUrl", message: "builder.err.url" });

  if (p.counters.length === 0) push({ field: "primary", message: "builder.err.noCounters" });
  const primaries = p.counters.filter((c) => c.isPrimary);
  if (p.counters.length > 0 && primaries.length !== 1)
    push({
      field: "primary",
      message: primaries.length === 0 ? "builder.err.noPrimary" : "builder.err.manyPrimaries",
      vars: { count: primaries.length },
    });
  const primary = primaries.length === 1 ? primaries[0] : undefined;
  if (primary && p.quickStartValues?.length) {
    const bad = p.quickStartValues.filter(
      (v) => (isSet(primary.min) && v < primary.min) || (isSet(primary.max) && v > primary.max),
    );
    if (bad.length)
      push({
        field: "quickStart",
        message: "builder.err.quickStart",
        vars: { values: bad.join(", ") },
      });
  }
  for (const c of p.counters) counterIssues(c, p, push);

  let other: string[] = [];
  if (issues.length === 0) {
    const r = validateCustomPreset(normalizeDraft(p, words));
    if (!r.ok) other = r.errors;
  }
  return { ok: issues.length === 0 && other.length === 0, issues, other };
}

export function issuesFor(v: DraftValidation, field: string): DraftIssue[] {
  return v.issues.filter((i) => i.field === field);
}

/** Issues for any field of a counter (for the counters list row). */
export function counterHasIssues(v: DraftValidation, id: string): boolean {
  const prefix = `c:${id}:`;
  return v.issues.some((i) => i.field.startsWith(prefix));
}

/** Parse "20, 25, 30" into numbers (invalid parts dropped). */
export function parseNumberList(text: string): number[] {
  return text
    .split(/[\s,;]+/)
    .filter(Boolean)
    .map(Number)
    .filter((n) => Number.isFinite(n));
}

/** Free-tier gate for creating another custom preset (§17.2: free 1, Pro unlimited). */
export function canCreateMore(count: number, limit: number): boolean {
  return count < limit;
}

/** A stable JSON snapshot for dirty checking. */
export function snapshot(p: Preset): string {
  return JSON.stringify(p);
}
