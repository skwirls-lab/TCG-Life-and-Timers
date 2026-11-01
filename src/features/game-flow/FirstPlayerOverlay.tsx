"use client";
/**
 * GAME-011 first-player announcement: a highlight cycles over the seat names, decelerates for
 * ~1.8 s and lands on the starter ("{name} goes first"). Tap skips to the result; tap again (or
 * wait) closes. Instant when "Dice & randomizer animations" is off or motion is reduced.
 *
 * The board's tile positions are unknown here, so the names are shown as a centered list.
 *
 * T3.7 roll-off (TOOL-004, GAME-012): the engine rolls the d20s itself when the game is created
 * or reset (`pickFirstSeat` with the store's Rng, ties re-roll among the tied seats) and records
 * them in `game.turn.rolloff`. This overlay only *shows* those rolls per seat: numbers tumble
 * during the spin, then every round's roll appears ("12 → 17" after a tie), and the winner's row
 * is highlighted. Nothing is re-rolled in the UI, so undo/reload show the same result.
 *
 * PRD §10.3 (coin-prominent presets, 2 players): "Flip a coin to decide" (TOOL-002) offers the
 * opening coin flip instead: seat 1 is heads, the flip winner picks who goes first
 * (SET_FIRST_PLAYER), and the flip is logged to the history (HIST-012).
 */
import { Crown, Dices } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui";
import { cryptoRng, seatById, type Game, type SeatId } from "@/engine";
import { useReducedMotion } from "@/features/app-effects/AppEffects";
import { toLogNote } from "@/features/tools/tools";
import { t } from "@/lib/i18n";
import { flipCoin, type CoinFace } from "@/lib/random";
import { cn } from "@/lib/ui/cn";
import { useDispatch } from "@/state/gameStore";
import { useSettingsStore } from "@/state/settingsStore";
import { TEST_HOOKS_ENABLED } from "@/state/testHooksFlag";
import {
  coinFlipWinner,
  latestFirstPlayerEvent,
  offersOpeningCoin,
  rolloffView,
  seatName,
  shouldAnnounce,
  spinSequence,
  type RolloffView,
} from "./flow";
import { useFlowUi } from "./flowUi";

const RESULT_MS = 2000;
const coinRng = cryptoRng();

export function FirstPlayerOverlay({ game }: { game: Game }) {
  const ev = latestFirstPlayerEvent(game);
  const key = ev ? `${game.id}:${ev.id}` : null;
  const announced = useFlowUi((s) => (key ? s.announced.includes(key) : true));
  const markAnnounced = useFlowUi((s) => s.markAnnounced);
  const dispatch = useDispatch();
  const diceAnimations = useSettingsStore((s) => s.settings.diceAnimations);
  const reduced = useReducedMotion();
  const testSkip =
    TEST_HOOKS_ENABLED && typeof window !== "undefined" && window.__tcgSkipAnnounceGame === game.id;
  const visible = !!key && !announced && !testSkip && shouldAnnounce(game);

  const seats = game.seats;
  const target = Math.max(
    0,
    seats.findIndex((s) => s.id === ev?.seatId),
  );
  const manual = ev?.meta?.rule === "manual";
  const instant = !diceAnimations || reduced || manual || seats.length < 2;
  const seq = useMemo(() => spinSequence(seats.length, target), [seats.length, target]);
  const rolloff = useMemo(() => rolloffView(game), [game]);
  const coinOffered = !manual && offersOpeningCoin(game);
  const [spin, setSpin] = useState<{ key: string | null; i: number; skipped: boolean }>({
    key: null,
    i: 0,
    skipped: false,
  });
  const [coin, setCoin] = useState<{ key: string; face: CoinFace } | null>(null);
  const flipped = coin && coin.key === key ? coin : null;
  const mine = spin.key === key;
  const landed = instant || (mine && (spin.skipped || spin.i >= seq.length - 1));
  const highlight = landed ? target : mine ? (seq[spin.i]?.index ?? 0) : (seq[0]?.index ?? 0);

  // Drive the spin with a chain of timeouts.
  useEffect(() => {
    if (!visible || instant || !key) return;
    let i = 0;
    let timer: ReturnType<typeof setTimeout>;
    const step = () => {
      i += 1;
      setSpin((s) => (s.key === key && s.skipped ? s : { key, i, skipped: false }));
      if (i < seq.length - 1) timer = setTimeout(step, seq[i + 1]?.delayMs ?? 60);
    };
    timer = setTimeout(() => {
      setSpin({ key, i: 0, skipped: false });
      timer = setTimeout(step, seq[1]?.delayMs ?? 60);
    }, 0);
    return () => clearTimeout(timer);
  }, [visible, instant, key, seq]);

  // Auto-close a little after landing (not while the coin option is offered or in use).
  useEffect(() => {
    if (!visible || !landed || !key || coinOffered || flipped) return;
    const timer = setTimeout(() => markAnnounced(key), RESULT_MS);
    return () => clearTimeout(timer);
  }, [visible, landed, key, markAnnounced, coinOffered, flipped]);

  if (!visible || !key) return null;
  const starter = seatName(game, ev?.seatId);
  const onTap = () => {
    if (flipped) return; // the flip winner must choose
    if (!landed) setSpin({ key, i: seq.length - 1, skipped: true });
    else markAnnounced(key);
  };
  const flip = () => {
    const face = flipCoin(coinRng);
    setCoin({ key, face });
    dispatch(
      toLogNote({ kind: "coin", mode: "flip", flips: [face], heads: face === "heads" ? 1 : 0 }),
    );
  };
  const choose = (seatId: SeatId) => {
    markAnnounced(key);
    dispatch({ type: "SET_FIRST_PLAYER", seatId });
  };

  return (
    <div
      className="fixed inset-0 z-[55] flex items-center justify-center bg-black/75"
      data-testid="first-player-overlay"
      data-landed={landed ? "1" : "0"}
      data-rule={rolloff ? "rolloff" : String(ev?.meta?.rule ?? "")}
    >
      <button
        type="button"
        onClick={onTap}
        aria-label={landed ? t("common.close") : t("shell.firstPlayer.skip")}
        data-testid="first-player-skip"
        className="absolute inset-0 h-full w-full cursor-pointer"
      />
      <div className="pointer-events-none relative flex w-[min(88vw,24rem)] flex-col items-center gap-5">
        {flipped ? (
          <CoinChooser game={game} face={flipped.face} onChoose={choose} />
        ) : (
          <>
            {rolloff ? (
              <RolloffList view={rolloff} landed={landed} tick={mine ? spin.i : 0} />
            ) : (
              <ol className="flex w-full flex-col items-center gap-1.5" aria-hidden>
                {seats.map((s, i) => {
                  const on = i === highlight;
                  return (
                    <li
                      key={s.id}
                      data-testid={`first-player-name-${i}`}
                      data-highlight={on ? "1" : "0"}
                      className={cn(
                        "w-[min(100%,16rem)] truncate rounded-full px-4 py-1.5 text-center text-lg font-semibold transition-transform duration-100",
                        on ? "scale-110 text-black shadow-lg" : "bg-surface-2/90 text-fg",
                      )}
                      style={{ background: on ? s.color : undefined }}
                    >
                      {s.name}
                    </li>
                  );
                })}
              </ol>
            )}
            <div
              className="flex min-h-24 flex-col items-center gap-2 text-center"
              aria-live="polite"
              role="status"
            >
              {landed ? (
                <>
                  <span className="inline-flex items-center gap-1 rounded-full bg-accent px-3 py-1 text-sm font-semibold text-accent-fg">
                    <Crown size={14} aria-hidden /> {t("shell.firstPlayer.chip")}
                  </span>
                  <span className="text-2xl font-bold" data-testid="first-player-result">
                    {t("shell.firstPlayer.goesFirst", { name: starter })}
                  </span>
                  <span className="text-sm text-fg-muted">{t("shell.firstPlayer.tapToClose")}</span>
                </>
              ) : (
                <span className="text-lg text-fg-muted">
                  {rolloff ? t("shell.rolloff.rolling") : t("shell.firstPlayer.picking")}
                </span>
              )}
            </div>
            {coinOffered && (
              <Button
                variant="secondary"
                className="pointer-events-auto"
                onClick={flip}
                data-testid="first-player-coin"
              >
                {t("shell.coin.offer")}
              </Button>
            )}
          </>
        )}
      </div>
    </div>
  );
}

/** Each seat's d20 roll(s); the numbers tumble until the spin lands. */
function RolloffList({ view, landed, tick }: { view: RolloffView; landed: boolean; tick: number }) {
  return (
    <div className="flex w-full flex-col items-center gap-2" data-testid="rolloff">
      <h2 className="flex items-center gap-2 text-lg font-semibold">
        <Dices size={20} aria-hidden /> {t("shell.rolloff.title")}
      </h2>
      <ol className="flex w-full flex-col gap-1.5">
        {view.rows.map((r, i) => {
          const win = landed && r.winner;
          return (
            <li
              key={r.seatId}
              data-testid={`rolloff-seat-${i}`}
              data-seat-id={r.seatId}
              data-winner={win ? "1" : "0"}
              data-rolls={landed ? r.rolls.join(",") : ""}
              aria-label={
                landed
                  ? t("shell.rolloff.seat", { name: r.name, rolls: r.rolls.join(", ") })
                  : undefined
              }
              className={cn(
                "flex items-center gap-3 rounded-2xl px-4 py-2",
                win ? "text-black shadow-lg" : "bg-surface-2/90 text-fg",
              )}
              style={{ background: win ? r.color : undefined }}
            >
              <span className="min-w-0 flex-1 truncate text-lg font-semibold">{r.name}</span>
              {landed ? (
                r.rolls.map((v, k) => (
                  <span key={k} className="flex items-center gap-1">
                    {k > 0 && (
                      <span aria-hidden className="text-sm opacity-70">
                        →
                      </span>
                    )}
                    <span
                      className={cn(
                        "flex size-10 items-center justify-center rounded-xl text-xl font-bold tabular",
                        k === r.rolls.length - 1 ? "bg-black/20" : "bg-black/10 opacity-70",
                      )}
                      data-testid={`rolloff-seat-${i}-roll-${k}`}
                    >
                      {v}
                    </span>
                  </span>
                ))
              ) : (
                <span
                  aria-hidden
                  className="flex size-10 items-center justify-center rounded-xl bg-black/20 text-xl font-bold tabular"
                >
                  {((tick + 1) * 7 + i * 11) % 20 || 20}
                </span>
              )}
            </li>
          );
        })}
      </ol>
      {landed && view.rounds > 1 && (
        <p className="text-sm text-fg-muted" data-testid="rolloff-reroll">
          {t("shell.rolloff.reroll")}
        </p>
      )}
    </div>
  );
}

/** Opening coin flip result: the winner picks who goes first. */
function CoinChooser({
  game,
  face,
  onChoose,
}: {
  game: Game;
  face: CoinFace;
  onChoose: (seatId: SeatId) => void;
}) {
  const winnerId = coinFlipWinner(game, face);
  const winner = seatById(game, winnerId)!;
  return (
    <div
      className="pointer-events-auto flex w-full flex-col items-center gap-4 rounded-[2rem] bg-surface p-5 text-center"
      data-testid="first-player-coin-result"
      data-face={face}
      data-winner={winnerId}
      role="status"
    >
      <span className="text-sm text-fg-muted">
        {t("shell.coin.call", { heads: game.seats[0]!.name, tails: game.seats[1]!.name })}
      </span>
      <span className="text-2xl font-bold">
        {t("shell.coin.result", {
          face: t(face === "heads" ? "shell.coin.heads" : "shell.coin.tails"),
          name: winner.name,
        })}
      </span>
      <span className="text-base">{t("shell.coin.choose", { name: winner.name })}</span>
      <div className="grid w-full grid-cols-2 gap-2">
        {game.seats.map((s, i) => (
          <Button
            key={s.id}
            onClick={() => onChoose(s.id)}
            data-testid={`first-player-coin-pick-${i}`}
            icon={
              <span aria-hidden className="size-4 rounded-full" style={{ background: s.color }} />
            }
          >
            <span className="truncate">{t("shell.coin.goesFirst", { name: s.name })}</span>
          </Button>
        ))}
      </div>
    </div>
  );
}
