/**
 * G-PRESETS (PRE-001): schema + semantic validation of presets. Used by `npm run check:presets`
 * for built-ins and by the custom preset builder for user presets.
 */
import {
  PresetSchema,
  type CounterDefinition,
  type Preset,
  type PresetCapability,
} from "../engine";
import { BUILT_IN_PRESETS } from "./index";

function reachable(def: CounterDefinition): boolean {
  const t = def.threshold;
  if (!t) return true;
  const { min, max } = def;
  if (t.comparator === "<=") return min === undefined || min === null || min <= t.value;
  return max === undefined || max === null || max >= t.value;
}

function triggeredAtStart(def: CounterDefinition): boolean {
  const t = def.threshold;
  if (!t || def.scope === "playerVsOpponent") return false;
  return t.comparator === "<=" ? def.start <= t.value : def.start >= t.value;
}

const within = (def: CounterDefinition, v: number) =>
  (def.min === undefined || def.min === null || v >= def.min) &&
  (def.max === undefined || def.max === null || v <= def.max);

/** Capability ⇔ counter consistency rules. */
const CAPABILITY_RULES: Partial<Record<PresetCapability, (c: CounterDefinition) => boolean>> = {
  commanderDamage: (c) => c.scope === "playerVsOpponent",
  commanderTax: (c) => c.category === "tax",
  dayNight: (c) => c.scope === "global" && c.kind === "enum" && c.icon === "daynight",
  monarch: (c) => c.scope === "token" && c.icon === "crown",
  initiative: (c) => c.scope === "token" && c.icon === "initiative",
  perTurnFlags: (c) => c.resetOnTurnPass === true,
};

/** Semantic checks beyond the schema. Returns human-readable errors (empty = valid). */
export function semanticErrors(p: Preset): string[] {
  const errs: string[] = [];
  const at = (m: string) => errs.push(`${p.id}: ${m}`);
  const ids = new Set<string>();
  for (const c of p.counters) {
    if (ids.has(c.id)) at(`duplicate counter id ${c.id}`);
    ids.add(c.id);
  }
  const primaries = p.counters.filter((c) => c.isPrimary);
  if (primaries.length !== 1) at(`expected exactly one primary counter, found ${primaries.length}`);
  const primary = primaries[0];
  if (primary) {
    if (primary.scope !== "player" || primary.kind !== "number")
      at("primary must be a player number counter");
    if (!primary.enabledByDefault) at("primary must be enabled by default");
    for (const v of p.quickStartValues ?? []) {
      if (!within(primary, v)) at(`quickStartValue ${v} outside primary [min,max]`);
    }
  } else if (p.quickStartValues?.length) {
    at("quickStartValues without a primary counter");
  }
  if (p.minPlayers > p.maxPlayers) at("minPlayers > maxPlayers");
  if (p.defaultPlayers < p.minPlayers || p.defaultPlayers > p.maxPlayers)
    at("defaultPlayers outside range");

  for (const c of p.counters) {
    const where = `counter ${c.id}`;
    if (
      c.min !== undefined &&
      c.min !== null &&
      c.max !== undefined &&
      c.max !== null &&
      c.min > c.max
    ) {
      at(`${where}: min > max`);
    }
    if (c.kind !== "token" && !within(c, c.start)) at(`${where}: start outside [min,max]`);
    if (!reachable(c)) at(`${where}: threshold unreachable within [min,max]`);
    if (triggeredAtStart(c)) at(`${where}: threshold already met at start`);
    if ((c.kind === "token") !== (c.scope === "token"))
      at(`${where}: token kind and scope must match`);
    if (c.kind === "enum") {
      const n = c.enumValues?.length ?? 0;
      if (n === 0) at(`${where}: enum without enumValues`);
      if (c.start < 0 || c.start >= n || !Number.isInteger(c.start))
        at(`${where}: enum start out of range`);
      if (c.enumCycleFrom !== undefined && c.enumCycleFrom >= n)
        at(`${where}: enumCycleFrom out of range`);
    } else if (c.enumValues) {
      at(`${where}: enumValues on a non-enum counter`);
    }
    if (c.kind === "boolean" && c.start !== 0 && c.start !== 1)
      at(`${where}: boolean start must be 0 or 1`);
    if (c.threshold && c.kind !== "number") at(`${where}: thresholds need a number counter`);
    if (c.threshold?.perSource && c.scope !== "playerVsOpponent")
      at(`${where}: perSource needs playerVsOpponent`);
    if (c.perCommander && c.scope !== "player") at(`${where}: perCommander needs player scope`);
    if (c.exclusiveGroup && c.kind !== "boolean")
      at(`${where}: exclusiveGroup needs a boolean counter`);
    if (c.linkedTo) {
      const target = p.counters.find((t) => t.id === c.linkedTo!.counterId);
      if (!target) at(`${where}: linkedTo unknown counter ${c.linkedTo.counterId}`);
      else if (target.scope !== "player" || target.kind !== "number") {
        at(`${where}: linkedTo target must be a player number counter`);
      }
    }
    if (c.resetOnTurnPass && c.scope !== "player" && c.scope !== "global") {
      at(`${where}: resetOnTurnPass needs player or global scope`);
    }
  }

  for (const [cap, test] of Object.entries(CAPABILITY_RULES) as [
    PresetCapability,
    (c: CounterDefinition) => boolean,
  ][]) {
    const has = p.capabilities.includes(cap);
    const backed = p.counters.some(test);
    if (has && !backed) at(`capability ${cap} has no matching counter`);
    if (!has && backed) at(`counter present but capability ${cap} missing`);
  }
  if (
    p.capabilities.includes("partners") &&
    !p.counters.some((c) => c.scope === "playerVsOpponent" || c.perCommander)
  ) {
    at("capability partners needs commander damage or per-commander tax");
  }
  if (new Set(p.capabilities).size !== p.capabilities.length) at("duplicate capabilities");
  return errs;
}

/** Schema + semantics for one preset. */
export function validatePreset(data: unknown): { ok: boolean; errors: string[] } {
  const parsed = PresetSchema.safeParse(data);
  if (!parsed.success) {
    const pid = (data as { id?: unknown } | null)?.id;
    const name = typeof pid === "string" ? pid : "(unknown)";
    return {
      ok: false,
      errors: parsed.error.issues.map((i) => `${name}: ${i.path.join(".")}: ${i.message}`),
    };
  }
  const errors = semanticErrors(parsed.data);
  return { ok: errors.length === 0, errors };
}

/** Validate a list of presets, including unique preset ids. */
export function validatePresets(presets: readonly unknown[]): {
  ok: boolean;
  errors: string[];
  count: number;
} {
  const errors: string[] = [];
  const seen = new Set<string>();
  for (const p of presets) {
    const r = validatePreset(p);
    errors.push(...r.errors);
    const pid = (p as { id?: unknown } | null)?.id;
    if (typeof pid === "string") {
      if (seen.has(pid)) errors.push(`duplicate preset id ${pid}`);
      seen.add(pid);
    }
  }
  return { ok: errors.length === 0, errors, count: presets.length };
}

export function validateAllBuiltInPresets(): { ok: boolean; errors: string[]; count: number } {
  return validatePresets(BUILT_IN_PRESETS);
}
