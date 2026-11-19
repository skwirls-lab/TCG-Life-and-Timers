/**
 * Custom preset repository (PRE-002, CUS-001, CUS-005, CUS-006 local part, CUS-007 JSON part) on
 * the Dexie `presets` table ({ id, schemaVersion, preset, updatedAt }).
 *
 * - Custom preset ids are prefixed `custom.`; stored presets always have `builtIn: false`.
 * - Every save validates with `PresetSchema` + `semanticErrors` (src/presets/validate.ts) and
 *   throws `PresetValidationError` (readable messages) when invalid.
 * - Capabilities that are backed by counters (commander damage, per-turn flags, …) are derived
 *   from the counters on save, so editing a counter can never leave a stale capability behind.
 * - `getAnyPreset` / `listAllPresets` merge built-ins and custom presets for the setup flow and
 *   the preset picker.
 */
import { nanoid } from "nanoid";
import { PresetSchema, type CounterDefinition, type Preset, type PresetCapability } from "@/engine";
import { getDb, type StoredPreset, type TcgDb } from "@/lib/db";
import { getBuiltInPreset, listBuiltInPresets } from "@/presets";
import { semanticErrors } from "@/presets/validate";

export const CUSTOM_PRESET_PREFIX = "custom.";
export const CUSTOM_PRESET_SCHEMA_VERSION = 1;
/** JSON export envelope marker (CUS-007). */
export const PRESET_EXPORT_FORMAT = "tcg-life-preset";
export const PRESET_EXPORT_VERSION = 1;
/** Imported/duplicated names are capped to keep list rows readable. */
export const MAX_PRESET_NAME = 60;

export class PresetValidationError extends Error {
  readonly errors: string[];
  constructor(errors: string[]) {
    super(errors.join("; "));
    this.name = "PresetValidationError";
    this.errors = errors;
  }
}

export interface RepoOptions {
  db?: TcgDb;
  now?: number;
}

export function isCustomPresetId(id: string): boolean {
  return id.startsWith(CUSTOM_PRESET_PREFIX) && id.length > CUSTOM_PRESET_PREFIX.length;
}

export function newCustomPresetId(): string {
  return `${CUSTOM_PRESET_PREFIX}${nanoid(10)}`;
}

/** Capabilities that must match a counter (mirrors CAPABILITY_RULES in src/presets/validate.ts). */
const DERIVED_CAPABILITIES: Partial<Record<PresetCapability, (c: CounterDefinition) => boolean>> = {
  commanderDamage: (c) => c.scope === "playerVsOpponent",
  commanderTax: (c) => c.category === "tax",
  dayNight: (c) => c.scope === "global" && c.kind === "enum" && c.icon === "daynight",
  monarch: (c) => c.scope === "token" && c.icon === "crown",
  initiative: (c) => c.scope === "token" && c.icon === "initiative",
  perTurnFlags: (c) => c.resetOnTurnPass === true,
};

/** Recompute counter-backed capabilities; keep the others (calculator, coin flip, …). */
export function deriveCapabilities(p: Preset): PresetCapability[] {
  const out: PresetCapability[] = [];
  for (const cap of p.capabilities) {
    if (cap in DERIVED_CAPABILITIES || out.includes(cap)) continue;
    if (
      cap === "partners" &&
      !p.counters.some((c) => c.scope === "playerVsOpponent" || c.perCommander)
    )
      continue;
    out.push(cap);
  }
  for (const [cap, test] of Object.entries(DERIVED_CAPABILITIES) as [
    PresetCapability,
    (c: CounterDefinition) => boolean,
  ][]) {
    if (p.counters.some(test)) out.push(cap);
  }
  return out;
}

/** Normalize a preset into a custom one (no built-in/premium/hidden flags, derived capabilities). */
export function toCustom(p: Preset, id: string = p.id): Preset {
  const { premium: _premium, hidden: _hidden, deferred: _deferred, ...rest } = p;
  const out: Preset = { ...rest, id, builtIn: false };
  out.capabilities = deriveCapabilities(out);
  return out;
}

/** Strip the `<presetId>: ` prefix semantic errors carry. */
function readable(errors: string[], id: string): string[] {
  const prefix = `${id}: `;
  return errors.map((e) => (e.startsWith(prefix) ? e.slice(prefix.length) : e));
}

export type ValidationResult = { ok: true; preset: Preset } | { ok: false; errors: string[] };

/** Schema + semantic validation with readable messages (no id prefixes). */
export function validateCustomPreset(data: unknown): ValidationResult {
  const parsed = PresetSchema.safeParse(data);
  if (!parsed.success) {
    return {
      ok: false,
      errors: parsed.error.issues.map((i) =>
        i.path.length ? `${i.path.join(".")}: ${i.message}` : i.message,
      ),
    };
  }
  const errors = readable(semanticErrors(parsed.data), parsed.data.id);
  return errors.length ? { ok: false, errors } : { ok: true, preset: parsed.data };
}

function fromRow(row: StoredPreset | undefined): Preset | undefined {
  if (!row) return undefined;
  const parsed = PresetSchema.safeParse(row.preset);
  return parsed.success ? parsed.data : undefined;
}

/** Custom presets, most recently updated first. Rows that fail validation are skipped. */
export async function listCustomPresets(db: TcgDb = getDb()): Promise<Preset[]> {
  const rows = await db.presets.orderBy("id").toArray();
  return rows
    .filter((r) => isCustomPresetId(r.id))
    .sort((a, b) => b.updatedAt - a.updatedAt)
    .map(fromRow)
    .filter((p): p is Preset => p !== undefined);
}

export async function countCustomPresets(db: TcgDb = getDb()): Promise<number> {
  return (await listCustomPresets(db)).length;
}

export async function getCustomPreset(
  id: string,
  db: TcgDb = getDb(),
): Promise<Preset | undefined> {
  if (!isCustomPresetId(id)) return undefined;
  return fromRow(await db.presets.get(id));
}

/**
 * Validate and store a custom preset. A preset without a `custom.` id (e.g. a draft copied from a
 * built-in) gets a fresh one. The stored version increases on every save of an existing preset.
 */
export async function saveCustomPreset(preset: Preset, opts: RepoOptions = {}): Promise<Preset> {
  const db = opts.db ?? getDb();
  const id = isCustomPresetId(preset.id) ? preset.id : newCustomPresetId();
  const prev = await getCustomPreset(id, db);
  const candidate = toCustom({ ...preset, version: prev ? prev.version + 1 : preset.version }, id);
  const result = validateCustomPreset(candidate);
  if (!result.ok) throw new PresetValidationError(result.errors);
  await db.presets.put({
    id,
    schemaVersion: CUSTOM_PRESET_SCHEMA_VERSION,
    preset: result.preset,
    updatedAt: opts.now ?? Date.now(),
  });
  return result.preset;
}

export async function deleteCustomPreset(id: string, db: TcgDb = getDb()): Promise<void> {
  if (!isCustomPresetId(id)) return;
  await db.presets.delete(id);
}

function copyName(name: string): string {
  return `${name} (copy)`.slice(0, MAX_PRESET_NAME);
}

/** A deep copy of any preset as an unsaved custom draft (fresh id, "… (copy)", version 1). */
export function copyPreset(source: Preset): Preset {
  const clone = structuredClone(source);
  return toCustom({ ...clone, name: copyName(clone.name), version: 1 }, newCustomPresetId());
}

/** PRE-002: duplicate a built-in preset into a stored custom preset. */
export async function duplicateBuiltIn(presetId: string, opts: RepoOptions = {}): Promise<Preset> {
  const source = getBuiltInPreset(presetId);
  if (!source) throw new Error(`Unknown built-in preset ${presetId}`);
  return saveCustomPreset(copyPreset(source), opts);
}

/** Duplicate a stored custom preset. */
export async function duplicateCustomPreset(id: string, opts: RepoOptions = {}): Promise<Preset> {
  const source = await getCustomPreset(id, opts.db ?? getDb());
  if (!source) throw new Error(`Unknown custom preset ${id}`);
  return saveCustomPreset(copyPreset(source), opts);
}

/** Built-in (including hidden) or custom preset by id. */
export async function getAnyPreset(id: string, db: TcgDb = getDb()): Promise<Preset | undefined> {
  return getBuiltInPreset(id) ?? (await getCustomPreset(id, db));
}

/** Visible built-ins followed by custom presets (for the setup flow and the preset picker). */
export async function listAllPresets(db: TcgDb = getDb()): Promise<Preset[]> {
  return [...listBuiltInPresets(), ...(await listCustomPresets(db))];
}

// ---------------------------------------------------------------------------------------------
// JSON export / import (CUS-007; share links come in T7.3)
// ---------------------------------------------------------------------------------------------

export interface PresetExport {
  format: typeof PRESET_EXPORT_FORMAT;
  version: number;
  preset: Preset;
}

export function exportPreset(p: Preset): string {
  const envelope: PresetExport = {
    format: PRESET_EXPORT_FORMAT,
    version: PRESET_EXPORT_VERSION,
    preset: p,
  };
  return JSON.stringify(envelope, null, 2);
}

export function exportPresetBlob(p: Preset): Blob {
  return new Blob([exportPreset(p)], { type: "application/json" });
}

/** e.g. "lore-race.tcg-preset.json". */
export function presetFileName(p: Preset): string {
  const slug = p.name
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);
  return `${slug || "preset"}.tcg-preset.json`;
}

export type ImportResult = { ok: true; preset: Preset } | { ok: false; errors: string[] };

function unwrap(data: unknown): { ok: true; value: unknown } | { ok: false; error: string } {
  if (typeof data !== "object" || data === null || Array.isArray(data))
    return { ok: false, error: "The file does not contain a game type." };
  const obj = data as Record<string, unknown>;
  // Envelope: { format, version, preset }. (Presets have a `format` field too, but no `preset`.)
  if ("preset" in obj && !("counters" in obj)) {
    if (obj.format !== PRESET_EXPORT_FORMAT)
      return { ok: false, error: "This is not a TCGTempo game type file." };
    if (typeof obj.version !== "number" || obj.version > PRESET_EXPORT_VERSION)
      return { ok: false, error: "This game type file was made by a newer version of the app." };
    return { ok: true, value: obj.preset };
  }
  return { ok: true, value: obj };
}

/**
 * Parse exported JSON (the envelope or a bare preset) into a validated custom copy with a fresh
 * id (the importer owns it; CUS-007). Nothing is stored: pass the result to `saveCustomPreset`.
 */
export function importPresetJson(text: string): ImportResult {
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    return { ok: false, errors: ["The text is not valid JSON."] };
  }
  const inner = unwrap(data);
  if (!inner.ok) return { ok: false, errors: [inner.error] };
  const raw = inner.value;
  if (typeof raw !== "object" || raw === null || Array.isArray(raw))
    return { ok: false, errors: ["The file does not contain a game type."] };
  const id = newCustomPresetId();
  const shaped = { ...(raw as Record<string, unknown>), id, builtIn: false };
  const parsed = PresetSchema.safeParse(shaped);
  if (!parsed.success) {
    return {
      ok: false,
      errors: parsed.error.issues.map((i) =>
        i.path.length ? `${i.path.join(".")}: ${i.message}` : i.message,
      ),
    };
  }
  const candidate = toCustom(
    { ...parsed.data, name: parsed.data.name.slice(0, MAX_PRESET_NAME), version: 1 },
    id,
  );
  return validateCustomPreset(candidate);
}

/** Import and store in one step (UI convenience). */
export async function importAndSave(text: string, opts: RepoOptions = {}): Promise<ImportResult> {
  const r = importPresetJson(text);
  if (!r.ok) return r;
  return { ok: true, preset: await saveCustomPreset(r.preset, opts) };
}
