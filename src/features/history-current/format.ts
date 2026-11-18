/**
 * Current-game history view models (HIST-001, HIST-002, HIST-010..013). Pure: turns the engine
 * log into display rows, groups linked effects, derives undone events from `session.future`
 * (D-027) and builds the life-chart series.
 */
import {
  counterDef,
  describeCause,
  enumLabel,
  formatClock as formatTimerClock,
  primaryCounter,
  seatById,
  startValue,
  type CounterCategory,
  type EliminationCause,
  type Game,
  type GameEvent,
  type GameEventKind,
  type GameSession,
  type SeatId,
} from "@/engine";
import { t, tp, type MessageKey } from "@/lib/i18n";

/** Delta-chip tones (HIST-011): life loss red / gain green, poison purple, commander orange, timers blue. */
export type Tone = "loss" | "gain" | "poison" | "commander" | "timer" | "neutral";

export interface EventRowView {
  id: string;
  at: number;
  kind: GameEventKind;
  /** The affected seat (colored dot). */
  seatId?: SeatId;
  color?: string;
  /** Seat name, "Source → Target" for matrix counters, or a sentence for inline events. */
  label: string;
  /** GameIcon id. */
  icon: string;
  chip?: { text: string; tone: Tone };
  /** "→ 35" */
  value?: string;
  /** Accent for inline events (turn passes and clock events are timer-blue). */
  tone?: Tone;
  /** counter rows vs. inline (turn, dice, elimination…) rows with distinct styling. */
  variant: "counter" | "event";
}

export function categoryTone(category: CounterCategory | undefined, delta: number): Tone {
  switch (category) {
    case "life":
      return delta < 0 ? "loss" : "gain";
    case "poison":
      return "poison";
    case "commander":
      return "commander";
    default:
      return "neutral";
  }
}

/** Signed delta with a real minus sign: +3 / −3. */
export function formatDelta(delta: number): string {
  return delta < 0 ? `−${Math.abs(delta)}` : `+${delta}`;
}

export function seatName(game: Game, seatId: SeatId | undefined | null): string {
  if (!seatId) return t("history.unknownSeat");
  const seat = seatById(game, seatId);
  if (seat) return seat.name;
  const rec = game.eliminations.find((e) => e.seatId === seatId);
  return rec?.name ?? t("history.unknownSeat");
}

function seatColor(game: Game, seatId: SeatId | undefined | null): string | undefined {
  return seatId ? seatById(game, seatId)?.color : undefined;
}

const str = (v: unknown): string => (v === null || v === undefined ? "" : String(v));
const num = (v: unknown): number => (typeof v === "number" ? v : Number(v) || 0);

export function formatCause(game: Game, seatId: SeatId, cause: EliminationCause): string {
  const d = describeCause(game, seatId, cause);
  if (d.kind !== "threshold") return t(`history.cause.${d.kind}` as MessageKey);
  const counter = d.counterName ?? d.counterId ?? "";
  const value = d.value ?? "";
  if (d.sourceSeatId !== undefined) {
    const source = d.sourceName ?? seatName(game, d.sourceSeatId);
    return d.commanderName
      ? t("history.cause.thresholdFromCommander", {
          value,
          counter,
          source,
          commander: d.commanderName,
        })
      : t("history.cause.thresholdFrom", { value, counter, source });
  }
  return t("history.cause.threshold", { value, counter });
}

function causeFromMeta(meta: GameEvent["meta"]): EliminationCause {
  const kind = str(meta?.cause);
  if (kind === "threshold") {
    const c: EliminationCause = { kind: "threshold", counterId: str(meta?.counterId) };
    if (meta?.sourceSeatId !== undefined) c.sourceSeatId = str(meta.sourceSeatId);
    if (meta?.sourceIndex !== undefined) c.sourceIndex = num(meta.sourceIndex);
    return c;
  }
  if (kind === "concede" || kind === "time") return { kind };
  return { kind: "manual" };
}

function counterRow(event: GameEvent, game: Game): EventRowView {
  const def = event.counterId ? counterDef(game, event.counterId) : undefined;
  const target = event.seatId;
  const label =
    event.sourceSeatId !== undefined && def?.scope === "playerVsOpponent"
      ? `${seatName(game, event.sourceSeatId)} → ${seatName(game, target)}`
      : target
        ? seatName(game, target)
        : (def?.name ?? "");
  const delta = event.delta ?? 0;
  const base: EventRowView = {
    id: event.id,
    at: event.updatedAt ?? event.at,
    kind: event.kind,
    label,
    icon: def?.icon ?? "circle",
    variant: "counter",
  };
  if (target) {
    base.seatId = target;
    const c = seatColor(game, target);
    if (c) base.color = c;
  }
  if (def?.kind === "enum") {
    base.value = `→ ${enumLabel(def, event.to ?? 0) ?? str(event.to)}`;
    return base;
  }
  if (def?.kind === "boolean") {
    base.value = `→ ${t(event.to ? "history.on" : "history.off")}`;
    return base;
  }
  base.chip = { text: formatDelta(delta), tone: categoryTone(def?.category, delta) };
  if (event.to !== undefined) base.value = `→ ${event.to}`;
  return base;
}

function eventLabel(event: GameEvent, game: Game): { label: string; icon: string; tone?: Tone } {
  const m = event.meta ?? {};
  const name = seatName(game, event.seatId);
  switch (event.kind) {
    case "start":
      return { label: t("history.ev.start", { name }), icon: "flag" };
    case "turn":
      return {
        label: t("history.ev.turn", { turn: num(m.turnNumber), name }),
        icon: "clock",
        tone: "timer",
      };
    case "firstPlayer":
      return { label: t("history.ev.firstPlayer", { name }), icon: "star" };
    case "eliminate":
    case "concede": {
      const cause = formatCause(game, event.seatId ?? "", causeFromMeta(m));
      const key = event.kind === "concede" ? "history.ev.concede" : "history.ev.eliminate";
      return { label: `${t(key, { name })} · ${cause}`, icon: "skull" };
    }
    case "revive":
      return { label: t("history.ev.revive", { name }), icon: "heart" };
    case "gameEnd": {
      const winners = str(m.winners)
        .split(",")
        .filter(Boolean)
        .map((id) => seatName(game, id));
      return {
        label: winners.length
          ? t("history.ev.gameEnd", { winners: winners.join(", ") })
          : t("history.ev.gameEndDraw"),
        icon: "trophy",
      };
    }
    case "reset":
      return { label: t("history.ev.reset"), icon: "flag" };
    case "seatAdd":
      return { label: t("history.ev.seatAdd", { name: str(m.name) || name }), icon: "plus" };
    case "seatRemove":
      return { label: t("history.ev.seatRemove", { name: str(m.name) || name }), icon: "minus" };
    case "seatReorder":
      return { label: t("history.ev.seatReorder"), icon: "hexagon" };
    case "note":
      return { label: t("history.ev.note", { text: str(m.text) }), icon: "book" };
    case "dice": {
      const count = num(m.count) || 1;
      const vars = {
        sides: num(m.sides),
        total: num(m.total),
        count,
        values: str(m.values).split(",").join(" + "),
      };
      return {
        label: count > 1 ? t("history.ev.dice", vars) : t("history.ev.die", vars),
        icon: "dice",
      };
    }
    case "coin": {
      const flips = str(m.flips);
      const heads = num(m.heads);
      if (m.mode === "untilTails")
        return { label: t("history.ev.untilTails", { heads }), icon: "coin" };
      if (flips.length > 1)
        return { label: t("history.ev.coins", { count: flips.length, heads }), icon: "coin" };
      return {
        label: t("history.ev.coin", {
          face: t(flips === "H" ? "history.heads" : "history.tails"),
        }),
        icon: "coin",
      };
    }
    case "random": {
      const picked = seatName(game, str(m.resultSeatId) || null);
      if (m.mode === "opponent") {
        return {
          label: t("history.ev.randomOpponent", {
            chooser: seatName(game, str(m.chooserSeatId) || event.seatId),
            name: picked,
          }),
          icon: "target",
        };
      }
      return { label: t("history.ev.randomPlayer", { name: picked }), icon: "target" };
    }
    case "token": {
      const def = event.counterId ? counterDef(game, event.counterId) : undefined;
      const counter = def?.name ?? str(event.counterId);
      return {
        label: event.seatId
          ? t("history.ev.token", { counter, name })
          : t("history.ev.tokenCleared", { counter }),
        icon: def?.icon ?? "crown",
      };
    }
    case "timer": {
      const action = str(m.action ?? m.type ?? m.transition);
      const known: Record<string, MessageKey> = {
        adjust: "history.ev.timer.adjust",
        set: "history.ev.timer.set",
        respond: "history.ev.timer.respond",
        passBack: "history.ev.timer.passBack",
        returnToActive: "history.ev.timer.returnToActive",
        pause: "history.ev.timer.pause",
        resume: "history.ev.timer.resume",
        timeout: "history.ev.timer.timeout",
        matchEnd: "history.ev.timer.matchEnd",
        restart: "history.ev.timer.restart",
        blockersStart: "history.ev.timer.blockersStart",
        blockersTimeUp: "history.ev.timer.blockersTimeUp",
        "blockersEnd.declared": "history.ev.timer.blockersEnd.declared",
        "blockersEnd.timeout": "history.ev.timer.blockersEnd.timeout",
        "blockersEnd.pass": "history.ev.timer.blockersEnd.pass",
      };
      const key = known[action === "blockersEnd" ? `${action}.${str(m.reason)}` : action];
      const span = m.usedMs ?? m.durationMs;
      const delta =
        typeof event.delta === "number"
          ? `${event.delta >= 0 ? "+" : "−"}${formatTimerClock(Math.abs(event.delta), { showTenths: false })}`
          : "";
      return {
        label: key
          ? t(key, {
              name,
              delta,
              value:
                typeof event.to === "number"
                  ? formatTimerClock(event.to, { showTenths: false })
                  : typeof span === "number"
                    ? formatTimerClock(span, { showTenths: false })
                    : "",
            })
          : t("history.ev.timer", { action: action || "—" }),
        icon: "clock",
        tone: "timer",
      };
    }
    default:
      return { label: t("history.ev.unknown"), icon: "circle" };
  }
}

/** One display row per event (HIST-011 counter rows, HIST-012 inline events). */
export function formatEventRow(event: GameEvent, game: Game): EventRowView {
  if (event.kind === "counter") return counterRow(event, game);
  const { label, icon, tone } = eventLabel(event, game);
  const row: EventRowView = {
    id: event.id,
    at: event.updatedAt ?? event.at,
    kind: event.kind,
    label,
    icon,
    variant: "event",
  };
  const seatId =
    event.kind === "random" && event.meta?.resultSeatId
      ? str(event.meta.resultSeatId)
      : event.seatId;
  if (seatId) {
    row.seatId = seatId;
    const c = seatColor(game, seatId);
    if (c) row.color = c;
  }
  if (tone) row.tone = tone;
  return row;
}

export interface EventGroup {
  /** The primary event (e.g. commander damage). */
  event: GameEvent;
  /** Linked events grouped with it (e.g. the life loss from commander damage). */
  linked: GameEvent[];
}

/** Newest-first groups; events with `linkedTo` attach to their parent (HIST-011). */
export function groupEvents(log: readonly GameEvent[]): EventGroup[] {
  const ids = new Set(log.map((e) => e.id));
  const groups = new Map<string, EventGroup>();
  const order: EventGroup[] = [];
  for (const e of log) {
    if (e.linkedTo !== undefined && ids.has(e.linkedTo)) {
      groups.get(e.linkedTo)?.linked.push(e);
      continue;
    }
    const g = { event: e, linked: [] };
    groups.set(e.id, g);
    order.push(g);
  }
  return order.reverse();
}

/** Seats an event involves (for the standings filter). */
export function eventSeats(e: GameEvent): SeatId[] {
  const out = new Set<SeatId>();
  if (e.seatId) out.add(e.seatId);
  if (e.sourceSeatId) out.add(e.sourceSeatId);
  for (const k of ["resultSeatId", "chooserSeatId", "from", "to"] as const) {
    const v = e.meta?.[k];
    if (typeof v === "string" && v) out.add(v);
  }
  return [...out];
}

export function filterGroups(groups: readonly EventGroup[], seatId: SeatId | null): EventGroup[] {
  if (!seatId) return [...groups];
  return groups.filter((g) => [g.event, ...g.linked].some((e) => eventSeats(e).includes(seatId)));
}

/** D-027: events undone (present in the furthest redo state, absent now), newest first. */
export function undoneEvents(session: Pick<GameSession, "game" | "future">): GameEvent[] {
  const last = session.future[session.future.length - 1];
  if (!last) return [];
  const now = new Set(session.game.log.map((e) => e.id));
  return last.log.filter((e) => !now.has(e.id)).reverse();
}

/** Changes at or after `eventId`, linked effects counted with their parent (confirmation text). */
export function eventsFrom(game: Game, eventId: string): number {
  const i = game.log.findIndex((e) => e.id === eventId);
  return i < 0 ? 0 : game.log.slice(i).filter((e) => e.linkedTo === undefined).length;
}

// ---------------------------------------------------------------------------------------------
// Header (HIST-001)
// ---------------------------------------------------------------------------------------------

/** "12:34" / "1:02:03" */
export function formatDuration(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const pad = (n: number) => String(n).padStart(2, "0");
  return h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${m}:${pad(s)}`;
}

/** "Today at 10:05 AM" / "Yesterday at …" / locale date + time. */
export function formatRelativeStart(at: number, now: number, locale = "en-US"): string {
  const d = new Date(at);
  const time = d.toLocaleTimeString(locale, { hour: "numeric", minute: "2-digit" });
  const day = (x: Date) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  const diffDays = Math.round((day(new Date(now)) - day(d)) / 86_400_000);
  if (diffDays === 0) return t("history.today", { time });
  if (diffDays === 1) return t("history.yesterday", { time });
  return `${d.toLocaleDateString(locale, { month: "short", day: "numeric" })} ${time}`;
}

export function formatClock(at: number, locale = "en-US"): string {
  return new Date(at).toLocaleTimeString(locale, {
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
  });
}

export function shortGameId(id: string): string {
  return id
    .replace(/[^a-z0-9]/gi, "")
    .slice(-4)
    .toUpperCase();
}

export interface HeaderView {
  title: string;
  players: string;
  startValue: string;
  presetName: string;
  startedAt: number;
}

/**
 * `number` (A-11f, HIST-001 "Game 8"): this game's position in the device's history (earlier
 * saved games + 1). Without it the title falls back to a short id.
 */
export function headerView(game: Game, number?: number): HeaderView {
  const primary = primaryCounter(game.preset);
  const sv = startValue(game, primary, game.seats[0]?.id);
  return {
    title: t("history.gameNumber", { id: number ? String(number) : shortGameId(game.id) }),
    players: tp("history.players", game.seats.length),
    startValue: t("history.startValue", { name: primary.name, value: sv }),
    presetName: game.preset.name,
    startedAt: game.startedAt ?? game.createdAt,
  };
}

// ---------------------------------------------------------------------------------------------
// Life chart (HIST-002)
// ---------------------------------------------------------------------------------------------

export interface ChartPoint {
  x: number;
  y: number;
}

export interface ChartSeries {
  seatId: SeatId;
  name: string;
  color: string;
  points: ChartPoint[];
  /** x of elimination (☠ marker), if eliminated. */
  eliminatedAt?: ChartPoint;
}

export interface ChartData {
  axis: "time" | "turn";
  counterName: string;
  series: ChartSeries[];
  xMin: number;
  xMax: number;
  yMin: number;
  yMax: number;
}

/**
 * Primary counter per seat over time (minutes since start), or by turn number when turn
 * tracking is on and turns were passed. Step data: each change adds a point.
 */
export function lifeChartData(game: Game, now: number): ChartData {
  const primary = primaryCounter(game.preset);
  const t0 = game.startedAt ?? game.createdAt;
  const turnEvents = game.log.filter((e) => e.kind === "turn");
  const axis: ChartData["axis"] =
    game.options.turnTracking && turnEvents.length > 0 ? "turn" : "time";
  let turn = 1;
  const xOf = new Map<string, number>();
  for (const e of game.log) {
    if (e.kind === "turn") turn = num(e.meta?.turnNumber) || turn + 1;
    xOf.set(e.id, axis === "turn" ? turn : Math.max(0, (e.updatedAt ?? e.at) - t0) / 60_000);
  }
  const lastEventAt = game.log.reduce((mx, e) => Math.max(mx, e.updatedAt ?? e.at), t0);
  const xEnd =
    axis === "turn"
      ? turn
      : Math.max(
          0,
          (game.status === "ended" ? (game.endedAt ?? lastEventAt) : Math.max(now, lastEventAt)) -
            t0,
        ) / 60_000;

  let yMin = Infinity;
  let yMax = -Infinity;
  const series: ChartSeries[] = game.seats.map((seat) => {
    const start = startValue(game, primary, seat.id);
    const points: ChartPoint[] = [{ x: axis === "turn" ? 1 : 0, y: start }];
    let elim: ChartPoint | undefined;
    for (const e of game.log) {
      const x = xOf.get(e.id)!;
      if (e.kind === "counter" && e.counterId === primary.id && e.seatId === seat.id) {
        points.push({ x, y: e.to ?? points[points.length - 1]!.y });
      } else if ((e.kind === "eliminate" || e.kind === "concede") && e.seatId === seat.id) {
        elim = { x, y: points[points.length - 1]!.y };
      } else if (e.kind === "revive" && e.seatId === seat.id) {
        elim = undefined;
      }
    }
    const lastY = points[points.length - 1]!.y;
    points.push({ x: elim ? elim.x : xEnd, y: lastY });
    for (const p of points) {
      yMin = Math.min(yMin, p.y);
      yMax = Math.max(yMax, p.y);
    }
    return {
      seatId: seat.id,
      name: seat.name,
      color: seat.color,
      points,
      ...(elim ? { eliminatedAt: elim } : {}),
    };
  });
  if (!Number.isFinite(yMin)) {
    yMin = 0;
    yMax = 1;
  }
  if (yMin === yMax) yMax = yMin + 1;
  const xMin = axis === "turn" ? 1 : 0;
  return {
    axis,
    counterName: primary.name,
    series,
    xMin,
    xMax: Math.max(xEnd, xMin + (axis === "turn" ? 1 : 1 / 60)),
    yMin: Math.min(0, yMin),
    yMax,
  };
}

/** SVG step path ("hold until changed") for a series in a w×h plot box. */
export function stepPath(
  points: readonly ChartPoint[],
  scaleX: (x: number) => number,
  scaleY: (y: number) => number,
): string {
  if (points.length === 0) return "";
  const r = (n: number) => Math.round(n * 10) / 10;
  let d = `M${r(scaleX(points[0]!.x))},${r(scaleY(points[0]!.y))}`;
  for (let i = 1; i < points.length; i++) {
    const p = points[i]!;
    d += ` H${r(scaleX(p.x))} V${r(scaleY(p.y))}`;
  }
  return d;
}

/** Round axis ticks (1/2/5 × 10^n), at most ~`count` of them. */
export function niceTicks(min: number, max: number, count = 4): number[] {
  const span = max - min;
  if (!(span > 0)) return [min];
  const raw = span / count;
  const mag = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 5, 10].map((m) => m * mag).find((s) => s >= raw) ?? 10 * mag;
  const out: number[] = [];
  for (let v = Math.ceil(min / step) * step; v <= max + 1e-9; v += step) {
    out.push(Math.round(v * 1e6) / 1e6);
  }
  return out;
}
