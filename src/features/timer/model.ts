/**
 * TIMER-UI pure helpers (T2.3–T2.9): per-seat timer view, tile clock metrics, response-banner
 * elapsed time, settings option tables and the test-only `t.*` URL params. No React, no DOM.
 */
import {
  TIMEOUT_ACTIONS,
  TIMER_MODES,
  RESPONSE_MODES,
  PASS_MODES,
  isLimited,
  type Game,
  type SeatId,
  type TimerConfig,
  type TimerMode,
} from "@/engine";
import type { TileMetrics } from "@/features/board/boardHelpers";

export const MIN = 60_000;
export const SEC = 1000;

// ---------------------------------------------------------------------------------------------
// Seat view (T2.3 / T2.4)
// ---------------------------------------------------------------------------------------------

/** What a seat's timer bar shows. Primitive fields only (shallow-compared by the store hook). */
export interface SeatTimerView {
  /** Render the timer bar at all (clocks on or turn tracking on, seat alive, game not ended). */
  show: boolean;
  /** Clocks configured (mode ≠ off). */
  clocks: boolean;
  /** Clocks have been started (running or paused). */
  started: boolean;
  /** Clocks configured but not started yet (TMR-001 "Waiting to start"). */
  waiting: boolean;
  paused: boolean;
  /** It is this seat's turn (turn tracking). */
  isTurn: boolean;
  turnNumber: number;
  /** Top of the response stack (the responder holding priority). */
  isTop: boolean;
  /** Number of seats on the response stack. */
  depth: number;
  /** Stack top (the current responder), "" when none. */
  responderId: SeatId;
  responderName: string;
  activeName: string;
  /** TMR-005: may tap ⚡ Respond. */
  canRespond: boolean;
  /** TMR-006: may tap ↩ Pass back. */
  canPassBack: boolean;
  /** TMR-003: shows PASS TURN. */
  canPass: boolean;
  /** TMR-008: Return to active (turn holder while someone else responds). */
  canReturn: boolean;
  /** This seat's clock is the running one (holder pulse). */
  holding: boolean;
  passMode: TimerConfig["passMode"];
}

const HIDDEN: SeatTimerView = {
  show: false,
  clocks: false,
  started: false,
  waiting: false,
  paused: false,
  isTurn: false,
  turnNumber: 0,
  isTop: false,
  depth: 0,
  responderId: "",
  responderName: "",
  activeName: "",
  canRespond: false,
  canPassBack: false,
  canPass: false,
  canReturn: false,
  holding: false,
  passMode: "tap",
};

const nameOf = (g: Game, id: SeatId | undefined) =>
  (id && g.seats.find((s) => s.id === id)?.name) || "";

export function seatTimerView(game: Game, seatId: SeatId): SeatTimerView {
  const seat = game.seats.find((s) => s.id === seatId);
  const t = game.timer;
  const clocks = t.mode !== "off";
  const tracking = game.options.turnTracking || clocks;
  if (!seat || seat.eliminated || game.status === "ended" || !tracking) return HIDDEN;
  const started = clocks && (t.status === "running" || t.status === "paused");
  const waiting = clocks && t.status === "idle";
  const paused = t.status === "paused";
  const stack = started ? t.responseStack : [];
  const top = stack.at(-1);
  const active = game.turn.activeSeat;
  const isTurn = active === seatId;
  const isTop = top === seatId;
  const priority = top ?? active;
  const responses = t.config.responses;
  return {
    show: true,
    clocks,
    started,
    waiting,
    paused,
    isTurn,
    turnNumber: game.turn.turnNumber,
    isTop,
    depth: stack.length,
    responderId: top ?? "",
    responderName: nameOf(game, top),
    activeName: nameOf(game, active),
    canRespond: started && responses !== "disabled" && priority !== seatId,
    canPassBack: started && isTop,
    // Clocks configured: PASS TURN only once started (START begins them). The turn holder may
    // pass while the stack is empty or while they are its top (the engine clears it; TMR-009).
    canPass: isTurn && !waiting && (stack.length === 0 || isTop),
    canReturn: started && isTurn && stack.length > 0 && !isTop,
    holding: started && priority === seatId,
    passMode: clocks ? t.config.passMode : "tap",
  };
}

/** Clocks on, or turn tracking on: the tile needs its timer bar (reserve the bottom row). */
export function timerBarActive(game: Game): boolean {
  return game.timer.mode !== "off" || game.options.turnTracking;
}

// ---------------------------------------------------------------------------------------------
// Tile metrics (TMR-042: the holder's time ≥ 1/3 of the primary number)
// ---------------------------------------------------------------------------------------------

export interface Box {
  /** px from the tile's top, in the player's frame. */
  top: number;
  h: number;
  maxW: number;
}

export interface TimerTileMetrics {
  /**
   * "band": the chip gets its own band under the number and the buttons sit in the centre of the
   * bottom row (tall tiles); "row": chip + buttons side by side in the bottom row (short tiles).
   */
  mode: "band" | "row";
  /** Tile metrics to lay the tile out with (number possibly smaller). */
  tile: TileMetrics;
  chip: Box;
  buttons: Box;
  /** Holder time font size (px) and the smaller size for other seats. */
  clockPx: number;
  smallClockPx: number;
}

/** Touch-target height for the bar buttons. */
export const BUTTON_H = 48;
/** Room kept clear on each side for the corner mini-grid / badges. */
export const CORNER_W = 64;

/** Chip band height for a holder clock of `clockPx` (caption line + time + padding). */
export function bandHeight(clockPx: number): number {
  return Math.ceil(clockPx * 1.2) + 16;
}

/**
 * Where the timer bar goes (TMR-042: the holder's time ≥ 1/3 of the primary number). Tall tiles
 * give the chip its own band under the number (the number shrinks a little) and put the buttons in
 * the centre of the bottom row. Short tiles (4+ players) put chip + buttons side by side in the
 * bottom row and cap the number at 3× the time size.
 */
export function timerTileMetrics(
  frame: { w: number; h: number },
  metrics: (frame: { w: number; h: number }) => TileMetrics,
): TimerTileMetrics {
  const m0 = metrics(frame);
  // Fixed point: band for a clock of ceil(fontPx / 3).
  let band = bandHeight(Math.ceil(m0.fontPx / 3));
  let m = metrics({ w: frame.w, h: frame.h - band });
  for (let i = 0; i < 8; i++) {
    const need = bandHeight(Math.ceil(m.fontPx / 3));
    if (need <= band) break;
    band = need;
    m = metrics({ w: frame.w, h: frame.h - band });
  }
  const rowH = (bottomH: number) => Math.max(BUTTON_H, bottomH);
  const sideFree = Math.max(140, frame.w - 2 * CORNER_W);
  if (m.fontPx >= 0.7 * m0.fontPx && m.fontPx >= 72) {
    const clockPx = Math.ceil(m.fontPx / 3);
    return {
      mode: "band",
      tile: m,
      chip: { top: m.numberTop + m.numberH, h: band, maxW: sideFree },
      buttons: { top: frame.h - 4 - rowH(m.bottomH), h: rowH(m.bottomH), maxW: sideFree },
      clockPx,
      smallClockPx: Math.max(14, Math.round(clockPx * 0.55)),
    };
  }
  const cap = Math.max(14, m0.bottomH - 16);
  const clockPx = Math.min(cap, Math.max(14, Math.ceil(m0.fontPx / 3)));
  const tile = m0.fontPx > clockPx * 3 ? { ...m0, fontPx: clockPx * 3 } : m0;
  const row = { top: frame.h - 4 - rowH(m0.bottomH), h: rowH(m0.bottomH), maxW: sideFree };
  return {
    mode: "row",
    tile,
    chip: row,
    buttons: row,
    clockPx,
    smallClockPx: Math.max(13, Math.round(clockPx * 0.62)),
  };
}

// ---------------------------------------------------------------------------------------------
// Response banner (TMR-005): time spent by the current responder since they responded
// ---------------------------------------------------------------------------------------------

/** Wall time since the stack top responded, minus pauses in between (0 when no response). */
export function responseElapsed(game: Game, now: number): number {
  const top = game.timer.responseStack.at(-1);
  if (!top) return 0;
  let since: number | undefined;
  let idx = -1;
  for (let i = game.log.length - 1; i >= 0; i--) {
    const e = game.log[i]!;
    if (e.kind === "timer" && e.seatId === top && e.meta?.action === "respond") {
      since = e.at;
      idx = i;
      break;
    }
  }
  if (since === undefined) return 0;
  let paused = 0;
  let pausedAt: number | null = null;
  for (let i = idx + 1; i < game.log.length; i++) {
    const e = game.log[i]!;
    if (e.kind !== "timer") continue;
    if (e.meta?.action === "pause" && pausedAt === null) pausedAt = e.at;
    else if (e.meta?.action === "resume" && pausedAt !== null) {
      paused += e.at - pausedAt;
      pausedAt = null;
    }
  }
  const end = game.timer.status === "paused" && pausedAt !== null ? pausedAt : now;
  return Math.max(0, end - since - paused);
}

// ---------------------------------------------------------------------------------------------
// Settings tables (§13.1-C)
// ---------------------------------------------------------------------------------------------

/** Modes gated behind `timerAdvancedModes` (all free while the policy is ALL_FREE). */
export const ADVANCED_MODES: readonly TimerMode[] = [
  "bankIncrement",
  "bankDelay",
  "perTurn",
  "perTurnReserve",
];

export const BANK_MODES: readonly TimerMode[] = ["bank", "bankIncrement", "bankDelay"];
export const PER_TURN_MODES: readonly TimerMode[] = ["perTurn", "perTurnReserve"];

export const BANK_MINUTES = [5, 10, 15, 20, 25, 30, 45, 60] as const;
export const STEP_SECONDS = [0, 5, 10, 15, 30] as const;
export const PER_TURN_MS = [30 * SEC, MIN, 2 * MIN, 3 * MIN, 5 * MIN] as const;
export const MATCH_MINUTES = [0, 40, 50, 60] as const;
export const GRACE_MS = [30 * SEC, 60 * SEC, 2 * MIN, 5 * MIN] as const;

/** Warning presets (the thresholds row; a full add/remove sub-page is a requested shared change). */
export const WARNING_PRESETS: Record<string, number[]> = {
  standard: [5 * MIN, MIN, 10 * SEC],
  more: [10 * MIN, 5 * MIN, MIN, 10 * SEC],
  late: [MIN, 10 * SEC],
  off: [],
};

export function warningPresetId(warnings: readonly number[]): string {
  const key = [...warnings].sort((a, b) => b - a).join(",");
  for (const [id, v] of Object.entries(WARNING_PRESETS)) if (v.join(",") === key) return id;
  return "custom";
}

/** Config keys that only take effect on idle clocks (the engine ignores them while running). */
export const STRUCTURE_KEYS: readonly (keyof TimerConfig)[] = [
  "mode",
  "bankMs",
  "perTurnMs",
  "reserveMs",
  "match",
];

export function isStructurePatch(patch: Partial<TimerConfig>): boolean {
  return STRUCTURE_KEYS.some((k) => k in patch);
}

/** Short duration label: "30s", "2m", "1h 30m". */
export function shortDuration(ms: number): string {
  if (ms < MIN) return `${Math.round(ms / SEC)}s`;
  const m = Math.round(ms / MIN);
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  return m % 60 === 0 ? `${h}h` : `${h}h ${m % 60}m`;
}

/** Parse "h:mm", "mm" (minutes) or "m:ss"-free digits typed on the keypad → ms (minutes). */
export function parseMinutesInput(digits: string): number | null {
  const s = digits.trim();
  if (!/^\d{1,4}$/.test(s)) return null;
  // Up to 2 digits = minutes; 3–4 digits = h:mm (e.g. 130 → 1:30).
  const n = Number(s);
  const minutes = s.length <= 2 ? n : Math.floor(n / 100) * 60 + (n % 100);
  if (minutes <= 0 || minutes > 600) return null;
  return minutes * MIN;
}

export function limited(config: Pick<TimerConfig, "mode">): boolean {
  return isLimited(config.mode);
}

// ---------------------------------------------------------------------------------------------
// Test-only URL params (`t.mode=bank&t.bankMs=600000&…`), applied after a quick start
// ---------------------------------------------------------------------------------------------

const NUM_KEYS = [
  "bankMs",
  "incrementMs",
  "delayMs",
  "perTurnMs",
  "reserveMs",
  "graceMs",
  "addOnceMs",
] as const satisfies readonly (keyof TimerConfig)[];
const BOOL_KEYS = [
  "autoPauseBackground",
  "autoPauseMenus",
  "showTenths",
  "showTurnTime",
] as const satisfies readonly (keyof TimerConfig)[];

/**
 * `t.mode`, `t.bankMs`, `t.incrementMs`, `t.delayMs`, `t.perTurnMs`, `t.reserveMs`, `t.graceMs`,
 * `t.addOnceMs`, `t.timeoutAction`, `t.finalAction`, `t.responses`, `t.passMode`,
 * `t.autoPauseBackground`, `t.autoPauseMenus`, `t.showTenths`, `t.showTurnTime` (1/0),
 * `t.warnings=300000,60000` and `t.matchMs` + `t.extraTurns`. Invalid values are dropped.
 */
export function parseTimerParams(search: URLSearchParams): Partial<TimerConfig> {
  const out: Partial<TimerConfig> = {};
  const get = (k: string) => search.get(`t.${k}`);
  const mode = get("mode");
  if (mode && (TIMER_MODES as readonly string[]).includes(mode)) out.mode = mode as TimerMode;
  for (const k of NUM_KEYS) {
    const v = get(k);
    if (v !== null && v !== "" && Number.isFinite(Number(v)) && Number(v) >= 0) out[k] = Number(v);
  }
  for (const k of BOOL_KEYS) {
    const v = get(k);
    if (v === "1" || v === "true") out[k] = true;
    else if (v === "0" || v === "false") out[k] = false;
  }
  const ta = get("timeoutAction");
  if (ta && (TIMEOUT_ACTIONS as readonly string[]).includes(ta))
    out.timeoutAction = ta as TimerConfig["timeoutAction"];
  const fa = get("finalAction");
  if (fa === "lose" || fa === "flag") out.finalAction = fa;
  const rs = get("responses");
  if (rs && (RESPONSE_MODES as readonly string[]).includes(rs))
    out.responses = rs as TimerConfig["responses"];
  const pm = get("passMode");
  if (pm && (PASS_MODES as readonly string[]).includes(pm))
    out.passMode = pm as TimerConfig["passMode"];
  const w = get("warnings");
  if (w !== null) {
    const list = w
      .split(",")
      .filter((x) => x !== "")
      .map(Number)
      .filter((x) => Number.isFinite(x) && x > 0);
    out.warningsMs = list.sort((a, b) => b - a);
  }
  const match = get("matchMs");
  if (match !== null && Number(match) > 0) {
    out.match = { totalMs: Number(match), extraTurns: Math.max(0, Number(get("extraTurns") ?? 0)) };
  }
  return out;
}
