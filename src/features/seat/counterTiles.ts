/**
 * Counters-panel model (SEAT-001, §8.2): which tiles a seat's counters tab shows and what a tap
 * does. Pure; driven entirely by counter definitions (ARCH-003, no game-specific branches).
 */
import {
  enumLabel,
  globalValue,
  seatCounters,
  startValue,
  taxDisplay,
  type CounterDefinition,
  type Game,
  type GameAction,
  type SeatId,
} from "@/engine";

type DistributiveOmit<T, K extends PropertyKey> = T extends unknown ? Omit<T, K> : never;
export type MenuAction = DistributiveOmit<GameAction, "now">;

export interface CounterTile {
  /** unique per tile: counterId, or `${counterId}-${i}` for the 2nd+ commander instance */
  tileId: string;
  def: CounterDefinition;
  enabled: boolean;
  value: number;
  start: number;
  isDefault: boolean;
  sourceIndex?: number;
  /** true for global-scope counters (shared by the table) */
  global: boolean;
}

export function isTaxDef(def: CounterDefinition): boolean {
  return def.category === "tax" && def.kind === "number" && def.scope === "player";
}

/** Tiles for the counters tab: enabled player/token/global counters, then the disabled ones. */
export function counterTiles(game: Game, seatId: SeatId): CounterTile[] {
  const enabledIds = new Set(game.enabledCounters);
  const seatTiles = new Map<string, CounterTile[]>();
  for (const v of seatCounters(game, seatId)) {
    if (v.def.isPrimary) continue;
    const list = seatTiles.get(v.def.id) ?? [];
    const i = list.length;
    list.push({
      tileId: i === 0 ? v.def.id : `${v.def.id}-${i}`,
      def: v.def,
      enabled: true,
      value: v.value,
      start: v.start,
      isDefault: v.isDefault,
      ...(v.sourceIndex !== undefined ? { sourceIndex: v.sourceIndex } : {}),
      global: false,
    });
    seatTiles.set(v.def.id, list);
  }
  const enabled: CounterTile[] = [];
  const disabled: CounterTile[] = [];
  for (const def of game.preset.counters) {
    if (def.isPrimary || def.scope === "playerVsOpponent") continue;
    if (!enabledIds.has(def.id)) {
      disabled.push({
        tileId: def.id,
        def,
        enabled: false,
        value: def.start,
        start: def.start,
        isDefault: true,
        global: def.scope === "global",
      });
      continue;
    }
    if (def.scope === "global") {
      const value = globalValue(game, def.id);
      const start = startValue(game, def);
      enabled.push({
        tileId: def.id,
        def,
        enabled: true,
        value,
        start,
        isDefault: value === start,
        global: true,
      });
      continue;
    }
    enabled.push(...(seatTiles.get(def.id) ?? []));
  }
  return [...enabled, ...disabled];
}

/** Address fields for COUNTER_ADD / COUNTER_SET of a tile. */
function address(tile: CounterTile, seatId: SeatId) {
  return {
    counterId: tile.def.id,
    ...(tile.global ? {} : { seatId }),
    ...(tile.sourceIndex !== undefined ? { sourceIndex: tile.sourceIndex } : {}),
  };
}

/** Tap = increment (§8.2): numbers +step, tax +1 cast, booleans toggle, enums next, tokens give/clear. */
export function tapAction(tile: CounterTile, seatId: SeatId): MenuAction {
  const { def } = tile;
  if (!tile.enabled) return { type: "COUNTER_ENABLE", counterId: def.id, enabled: true };
  if (def.kind === "token") {
    return tile.value === 1
      ? { type: "TOKEN_CLEAR", counterId: def.id }
      : { type: "TOKEN_GIVE", counterId: def.id, seatId };
  }
  if (def.kind === "boolean")
    return { type: "BOOL_TOGGLE", counterId: def.id, ...(tile.global ? {} : { seatId }) };
  if (def.kind === "enum")
    return { type: "ENUM_NEXT", counterId: def.id, ...(tile.global ? {} : { seatId }) };
  if (isTaxDef(def))
    return {
      type: "CMD_TAX_CAST",
      counterId: def.id,
      seatId,
      commanderIndex: tile.sourceIndex ?? 0,
      delta: 1,
    };
  return { type: "COUNTER_ADD", ...address(tile, seatId), delta: def.step || 1 };
}

/** Hold option "−1" (one step down; one cast for tax). */
export function minusAction(tile: CounterTile, seatId: SeatId): MenuAction {
  if (isTaxDef(tile.def))
    return {
      type: "CMD_TAX_CAST",
      counterId: tile.def.id,
      seatId,
      commanderIndex: tile.sourceIndex ?? 0,
      delta: -1,
    };
  return { type: "COUNTER_ADD", ...address(tile, seatId), delta: -(tile.def.step || 1) };
}

/** Hold option "set exact" (numbers; tax sets the number of casts). */
export function setAction(tile: CounterTile, seatId: SeatId, value: number): MenuAction {
  return { type: "COUNTER_SET", ...address(tile, seatId), value };
}

/** Hold option "reset to start". */
export function resetAction(tile: CounterTile, seatId: SeatId): MenuAction {
  const { def } = tile;
  const seat = tile.global ? {} : { seatId };
  if (def.kind === "token") return { type: "TOKEN_CLEAR", counterId: def.id };
  if (def.kind === "boolean")
    return { type: "BOOL_TOGGLE", counterId: def.id, ...seat, value: tile.start === 1 };
  if (def.kind === "enum")
    return { type: "ENUM_SET", counterId: def.id, ...seat, index: tile.start };
  return setAction(tile, seatId, tile.start);
}

export type TileDisplay =
  | { kind: "number"; value: number }
  | { kind: "tax"; tax: number; casts: number }
  | { kind: "boolean"; on: boolean }
  | { kind: "enum"; label: string }
  | { kind: "token"; held: boolean }
  | { kind: "off" };

/** What the tile shows (formatted with i18n by the component). */
export function tileDisplay(game: Game, tile: CounterTile, seatId: SeatId): TileDisplay {
  const { def } = tile;
  if (!tile.enabled) return { kind: "off" };
  if (def.kind === "token") return { kind: "token", held: tile.value === 1 };
  if (def.kind === "boolean") return { kind: "boolean", on: tile.value === 1 };
  if (def.kind === "enum")
    return { kind: "enum", label: enumLabel(def, tile.value) ?? String(tile.value) };
  if (isTaxDef(def)) {
    const { tax, casts } = taxDisplay(game, seatId, tile.sourceIndex ?? 0, def.id);
    return { kind: "tax", tax, casts };
  }
  return { kind: "number", value: tile.value };
}
