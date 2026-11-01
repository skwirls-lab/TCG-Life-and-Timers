"use client";
/**
 * GAME-011 first-player announcement: a highlight cycles over the seat names, decelerates for
 * ~1.8 s and lands on the starter ("{name} goes first"). Tap skips to the result; tap again (or
 * wait) closes. Instant when "Dice & randomizer animations" is off or motion is reduced.
 *
 * The board's tile positions are unknown here, so the names are shown as a centered list.
 * Rule 'rolloff' currently animates like 'random' over the engine's d20 winner (rolls UI: T3.7).
 */
import { Crown } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import type { Game } from "@/engine";
import { useReducedMotion } from "@/features/app-effects/AppEffects";
import { t } from "@/lib/i18n";
import { cn } from "@/lib/ui/cn";
import { useSettingsStore } from "@/state/settingsStore";
import { TEST_HOOKS_ENABLED } from "@/state/testHooks";
import { latestFirstPlayerEvent, seatName, shouldAnnounce, spinSequence } from "./flow";
import { useFlowUi } from "./flowUi";

const RESULT_MS = 2000;

export function FirstPlayerOverlay({ game }: { game: Game }) {
  const ev = latestFirstPlayerEvent(game);
  const key = ev ? `${game.id}:${ev.id}` : null;
  const announced = useFlowUi((s) => (key ? s.announced.includes(key) : true));
  const markAnnounced = useFlowUi((s) => s.markAnnounced);
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
  const [spin, setSpin] = useState<{ key: string | null; i: number; skipped: boolean }>({
    key: null,
    i: 0,
    skipped: false,
  });
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

  // Auto-close a little after landing.
  useEffect(() => {
    if (!visible || !landed || !key) return;
    const timer = setTimeout(() => markAnnounced(key), RESULT_MS);
    return () => clearTimeout(timer);
  }, [visible, landed, key, markAnnounced]);

  if (!visible || !key) return null;
  const starter = seatName(game, ev?.seatId);
  const onTap = () => {
    if (!landed) setSpin({ key, i: seq.length - 1, skipped: true });
    else markAnnounced(key);
  };

  return (
    <div
      className="fixed inset-0 z-[55] flex items-center justify-center bg-black/75"
      data-testid="first-player-overlay"
      data-landed={landed ? "1" : "0"}
    >
      <button
        type="button"
        onClick={onTap}
        aria-label={landed ? t("common.close") : t("shell.firstPlayer.skip")}
        data-testid="first-player-skip"
        className="absolute inset-0 h-full w-full cursor-pointer"
      />
      <div className="pointer-events-none relative flex w-[min(88vw,24rem)] flex-col items-center gap-5">
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
            <span className="text-lg text-fg-muted">{t("shell.firstPlayer.picking")}</span>
          )}
        </div>
      </div>
    </div>
  );
}
