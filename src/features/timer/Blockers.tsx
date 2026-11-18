"use client";
/**
 * Declare-blockers window on the seat tiles (lazy chunk; loaded only when the window is enabled
 * or open). Rendered inside each tile, so it faces that seat's player:
 * - Attack (attacker's tile, next to PASS TURN): stops their clock, starts the shared countdown.
 * - the countdown banner on every tile while the window counts ("Blockers 0:18"; at 0:00
 *   "Blockers time is up"), announced politely (role=status);
 * - Blockers declared (every tile while nobody responds): ends the window, the attacker's clock
 *   runs again.
 */
import { ShieldCheck, Swords } from "lucide-react";
import { blockersRemaining, formatClock } from "@/engine";
import { t } from "@/lib/i18n";
import { cn } from "@/lib/ui/cn";
import { useGameStore } from "@/state/gameStore";
import { playTone } from "./actions";
import { useTickNow } from "./useTickNow";

function useBlockersLeft(): number | null {
  const timer = useGameStore((s) => s.session?.game.timer);
  const now = useTickNow(timer?.status === "running");
  return timer ? blockersRemaining({ timer }, Math.max(now, timer.runningSince ?? 0)) : null;
}

export function BlockersBanner({
  index,
  px,
  compact,
}: {
  index: number;
  px: number;
  compact: boolean;
}) {
  const left = useBlockersLeft();
  if (left === null) return null;
  const up = left <= 0;
  return (
    <div
      data-testid={`seat-${index}-blockers`}
      data-up={up || undefined}
      role="status"
      className={cn(
        "flex min-w-0 shrink items-center gap-1.5 overflow-hidden rounded-2xl bg-black/75 py-1 font-semibold ring-2",
        compact ? "px-2" : "px-3",
        up ? "ring-danger text-danger" : "ring-warning",
      )}
    >
      <ShieldCheck aria-hidden size={16} className="shrink-0" />
      <span className={cn("min-w-0 truncate", compact ? "text-xs" : "text-sm")}>
        {up ? t("timer.blockersUp") : t("timer.blockers")}
      </span>
      {!up && (
        <span
          data-testid={`seat-${index}-blockers-time`}
          className="shrink-0 font-bold tabular"
          style={{ fontSize: compact ? 15 : Math.max(14, px) }}
        >
          {formatClock(left, { showTenths: false })}
        </span>
      )}
    </div>
  );
}

function ActionButton({
  testId,
  label,
  hint,
  short,
  compact,
  icon,
  onClick,
}: {
  testId: string;
  label: string;
  hint?: string;
  short: string;
  compact: boolean;
  icon: React.ReactNode;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      data-testid={testId}
      aria-label={hint ?? label}
      title={hint ?? label}
      onClick={onClick}
      className={cn(
        "inline-flex h-12 min-w-12 shrink-0 select-none items-center justify-center gap-1 rounded-full bg-warning px-3 text-sm font-bold text-black shadow active:scale-95",
        compact && "flex-col gap-0 px-1.5",
      )}
    >
      {icon}
      <span
        aria-hidden={compact || undefined}
        className={cn("whitespace-nowrap", compact && "text-[0.6rem] leading-none")}
      >
        {compact ? short : label}
      </span>
    </button>
  );
}

export function AttackButton({ index, compact }: { index: number; compact: boolean }) {
  const dispatch = useGameStore((s) => s.dispatch);
  return (
    <ActionButton
      testId={`seat-${index}-attack`}
      label={t("timer.attack")}
      hint={t("timer.attackHint")}
      short={t("timer.attack")}
      compact={compact}
      icon={<Swords aria-hidden size={20} />}
      onClick={() => {
        dispatch({ type: "TIMER_BLOCKERS_START" });
        playTone("pass", "taps");
      }}
    />
  );
}

export function DeclaredButton({ index, compact }: { index: number; compact: boolean }) {
  const dispatch = useGameStore((s) => s.dispatch);
  return (
    <ActionButton
      testId={`seat-${index}-declared`}
      label={t("timer.declared")}
      short={t("timer.declaredShort")}
      compact={compact}
      icon={<ShieldCheck aria-hidden size={20} />}
      onClick={() => dispatch({ type: "TIMER_BLOCKERS_END" })}
    />
  );
}
