"use client";
/** Board-level game commands that aren't single engine actions. */
import type { Game, NewGameConfig, SeatInput } from "@/engine";
import { requestReset } from "@/features/history-past/whoWon";
import { useGameStore } from "@/state/gameStore";

/** Seats carried into a new game by index (names, art, colours, commanders, profiles). */
export function carrySeats(game: Game, players: number): SeatInput[] {
  return game.seats.slice(0, players).map((s) => {
    const seat: SeatInput = {
      id: s.id,
      name: s.name,
      color: s.color,
      commanders: s.commanders,
      contrast: s.contrast,
    };
    if (s.art) seat.art = s.art;
    if (s.profileId !== undefined) seat.profileId = s.profileId;
    if (s.deckId !== undefined) seat.deckId = s.deckId;
    if (s.deckName !== undefined) seat.deckName = s.deckName;
    return seat;
  });
}

/** Same preset/options as `game`, with a new player count (SET-011: callers confirm first). */
export function configWithPlayers(game: Game, players: number, layoutId?: string): NewGameConfig {
  return {
    preset: game.preset,
    players,
    seats: carrySeats(game, players),
    ...(layoutId !== undefined ? { layoutId } : {}),
    options: game.options,
    timer: game.timer.config,
    startOverrides: game.startOverrides,
    thresholdOverrides: game.thresholdOverrides,
    enabledCounters: game.enabledCounters,
  };
}

/** New game with another player count; the current one goes through Who won? (HIST-031). */
export function changePlayerCount(players: number, layoutId?: string): void {
  const game = useGameStore.getState().session?.game;
  if (!game) return;
  void requestReset({
    game,
    proceed: () => useGameStore.getState().newGame(configWithPlayers(game, players, layoutId)),
  });
}

/**
 * LAY-003: switch the layout variant without resetting. The frozen engine has no layout action,
 * so this patches `game.layoutId` in place (a display preference, like the sticky seat edits;
 * autosave persists it).
 */
export function setLayoutVariant(layoutId: string): void {
  useGameStore.setState((st) => {
    if (!st.session || st.session.game.layoutId === layoutId) return {};
    return { session: { ...st.session, game: { ...st.session.game, layoutId } } };
  });
}
