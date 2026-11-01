/**
 * Tool requests → results → LOG_NOTE actions (TOOL-001..003, TOOL-008, HIST-012). Pure: the
 * caller passes the Rng (cryptoRng in the app) and the current game (or null).
 */
import { aliveSeats, seatById, type Game, type Rng, type SeatId } from "@/engine";
import {
  clampDiceCount,
  clampDieSides,
  flipCoins,
  flipUntilTails,
  pickOpponent,
  pickPlayer,
  rollDice,
  type CoinFace,
} from "@/lib/random";
import type { ActionInput } from "@/state/gameStore";

export type ToolRequest =
  | { kind: "dice"; sides: number; count?: number }
  | { kind: "coin"; count?: number }
  | { kind: "untilTails" }
  | { kind: "player" }
  | { kind: "opponent"; chooserId: SeatId };

export interface SeatRef {
  id: SeatId;
  name: string;
  color: string;
}

export type ToolResult =
  | { kind: "dice"; sides: number; values: number[]; total: number }
  | { kind: "coin"; mode: "flip" | "untilTails"; flips: CoinFace[]; heads: number }
  | { kind: "player"; seat: SeatRef }
  | { kind: "opponent"; chooser: SeatRef; seat: SeatRef | null };

const ref = (game: Game, id: SeatId): SeatRef => {
  const s = seatById(game, id)!;
  return { id: s.id, name: s.name, color: s.color };
};

/** Run a tool. Seat randomizers need a game with living seats; they return null otherwise. */
export function runTool(req: ToolRequest, rng: Rng, game: Game | null): ToolResult | null {
  switch (req.kind) {
    case "dice": {
      const r = rollDice(rng, clampDiceCount(req.count ?? 1), clampDieSides(req.sides));
      return { kind: "dice", ...r };
    }
    case "coin":
      return { kind: "coin", mode: "flip", ...flipCoins(rng, req.count ?? 1) };
    case "untilTails":
      return { kind: "coin", mode: "untilTails", ...flipUntilTails(rng) };
    case "player": {
      if (!game) return null;
      const alive = aliveSeats(game).map((s) => s.id);
      if (alive.length === 0) return null;
      return { kind: "player", seat: ref(game, pickPlayer(rng, alive)) };
    }
    case "opponent": {
      if (!game || !seatById(game, req.chooserId)) return null;
      const alive = aliveSeats(game).map((s) => s.id);
      const picked = pickOpponent(rng, req.chooserId, alive);
      return {
        kind: "opponent",
        chooser: ref(game, req.chooserId),
        seat: picked === null ? null : ref(game, picked),
      };
    }
  }
}

/** Short, language-neutral summary stored as the LOG_NOTE text (the UI formats from meta). */
export function resultText(r: ToolResult): string {
  switch (r.kind) {
    case "dice":
      return r.values.length > 1
        ? `${r.values.length}d${r.sides}: ${r.values.join(" + ")} = ${r.total}`
        : `d${r.sides}: ${r.total}`;
    case "coin":
      return r.flips.map((f) => (f === "heads" ? "H" : "T")).join("");
    case "player":
      return r.seat.name;
    case "opponent":
      return `${r.chooser.name} → ${r.seat?.name ?? "—"}`;
  }
}

/** HIST-012: the LOG_NOTE action that records a result in the active game's log. */
export function toLogNote(r: ToolResult): ActionInput {
  const text = resultText(r);
  switch (r.kind) {
    case "dice":
      return {
        type: "LOG_NOTE",
        kind: "dice",
        text,
        meta: {
          sides: r.sides,
          count: r.values.length,
          values: r.values.join(","),
          total: r.total,
        },
      };
    case "coin":
      return {
        type: "LOG_NOTE",
        kind: "coin",
        text,
        meta: {
          mode: r.mode,
          count: r.flips.length,
          flips: r.flips.map((f) => (f === "heads" ? "H" : "T")).join(""),
          heads: r.heads,
        },
      };
    case "player":
      return {
        type: "LOG_NOTE",
        kind: "random",
        text,
        seatId: r.seat.id,
        meta: { mode: "player", resultSeatId: r.seat.id },
      };
    case "opponent":
      return {
        type: "LOG_NOTE",
        kind: "random",
        text,
        seatId: r.chooser.id,
        meta: { mode: "opponent", chooserSeatId: r.chooser.id, resultSeatId: r.seat?.id ?? null },
      };
  }
}
