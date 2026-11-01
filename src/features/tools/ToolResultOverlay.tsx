"use client";
/**
 * TOOL-009 result overlay: a large card centered over the screen (LifeTap's d6 "6" overlay).
 * Tap anywhere to dismiss, or "Roll again". Animations only when dice animations are on and
 * motion isn't reduced; otherwise the result appears instantly. TOOL-007: `rotation` turns the
 * card toward the invoking seat (centered/upright when invoked from the toolbar or page).
 */
import { useEffect, useRef, useState } from "react";
import { useShallow } from "zustand/react/shallow";
import { Button } from "@/components/ui";
import { aliveSeats } from "@/engine";
import { t, tp } from "@/lib/i18n";
import { useBackClose } from "@/lib/hooks/useBackClose";
import type { Rotation } from "@/lib/ui/rotation";
import { useGameStore } from "@/state/gameStore";
import { CoinIcon, DieIcon } from "./DieIcon";
import type { ToolResult } from "./tools";
import { useToolAnimations, useToolResult } from "./useToolRunner";

const CYCLE_MS = 900;
const TICK_MS = 90;

function DiceView({ r }: { r: Extract<ToolResult, { kind: "dice" }> }) {
  if (r.values.length === 1) {
    return (
      <div className="flex flex-col items-center gap-2">
        <DieIcon sides={r.sides} value={r.total} size={180} className="text-fg" />
        <span className="sr-only" data-testid="tool-result-value">
          {r.total}
        </span>
        <span className="text-lg text-fg-muted">{t("tools.die", { sides: r.sides })}</span>
      </div>
    );
  }
  return (
    <div className="flex flex-col items-center gap-3">
      <span className="text-lg text-fg-muted">
        {t("tools.result.diceLabel", { count: r.values.length, sides: r.sides })}
      </span>
      <ul
        className="flex max-w-xs flex-wrap justify-center gap-2"
        aria-label={t("tools.result.title")}
      >
        {r.values.map((v, i) => (
          <li key={i} data-testid="tool-result-die" data-value={v}>
            <DieIcon sides={r.sides} value={v} size={64} className="text-fg" label={String(v)} />
          </li>
        ))}
      </ul>
      <span className="text-4xl font-bold tabular" data-testid="tool-result-total">
        {t("tools.result.sum", { total: r.total })}
      </span>
      <span className="sr-only" data-testid="tool-result-value">
        {r.total}
      </span>
    </div>
  );
}

function CoinView({ r }: { r: Extract<ToolResult, { kind: "coin" }> }) {
  const single = r.mode === "flip" && r.flips.length === 1;
  const face = r.flips[0]!;
  if (single) {
    return (
      <div className="flex flex-col items-center gap-3">
        <CoinIcon face={face} size={160} className="text-warning" />
        <span className="text-4xl font-bold" data-testid="tool-result-value">
          {t(face === "heads" ? "tools.result.heads" : "tools.result.tails")}
        </span>
      </div>
    );
  }
  return (
    <div className="flex flex-col items-center gap-3">
      <ul className="flex max-w-xs flex-wrap justify-center gap-1">
        {r.flips.map((f, i) => (
          <li key={i} data-testid="tool-result-coin" data-face={f}>
            <CoinIcon face={f} size={44} className="text-warning" />
            <span className="sr-only">
              {t(f === "heads" ? "tools.result.heads" : "tools.result.tails")}
            </span>
          </li>
        ))}
      </ul>
      <span className="text-3xl font-bold" data-testid="tool-result-value">
        {r.mode === "untilTails"
          ? tp("tools.result.untilTails", r.heads)
          : tp("tools.result.headsCount", r.heads)}
      </span>
    </div>
  );
}

function SeatView({
  r,
  settled,
  cycleName,
}: {
  r: Extract<ToolResult, { kind: "player" | "opponent" }>;
  settled: boolean;
  cycleName: string | null;
}) {
  const heading =
    r.kind === "player"
      ? t("tools.result.player")
      : t("tools.result.opponent", { chooser: r.chooser.name });
  const shown = settled ? r.seat : null;
  return (
    <div className="flex flex-col items-center gap-3 text-center">
      <span className="text-lg text-fg-muted">{heading}</span>
      {r.seat === null ? (
        <span className="text-3xl font-bold" data-testid="tool-result-value">
          {t("tools.result.noOpponent")}
        </span>
      ) : (
        <span
          className="break-words text-5xl font-bold"
          style={{ color: shown?.color }}
          data-testid="tool-result-value"
          data-seat-id={shown?.id}
        >
          {shown?.name ?? cycleName}
        </span>
      )}
    </div>
  );
}

interface Props {
  rotation?: Rotation;
  /** Called after the overlay is dismissed. */
  onDismiss?: () => void;
}

export function ToolResultOverlay({ rotation = 0, onDismiss }: Props) {
  const result = useToolResult((s) => s.result);
  const request = useToolResult((s) => s.request);
  const rev = useToolResult((s) => s.rev);
  const run = useToolResult((s) => s.run);
  const dismissStore = useToolResult((s) => s.dismiss);
  const animate = useToolAnimations();
  const cardRef = useRef<HTMLDivElement>(null);
  const [settledRev, setSettledRev] = useState(-1);
  const [tick, setTick] = useState(0);
  const pool = useGameStore(
    useShallow((s) => (s.session ? aliveSeats(s.session.game).map((x) => x.name) : [])),
  );
  const open = result !== null;

  const dismiss = () => {
    dismissStore();
    onDismiss?.();
  };
  useBackClose(open, dismiss);

  const cycles = result !== null && (result.kind === "player" || result.kind === "opponent");
  const settled = !animate || !cycles || settledRev === rev;

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        useToolResult.getState().dismiss();
        onDismiss?.();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onDismiss]);

  useEffect(() => {
    if (!open || !animate || !cardRef.current?.animate) return;
    cardRef.current.animate(
      [
        { transform: `rotate(${rotation - 12}deg) scale(0.6)`, opacity: 0 },
        { transform: `rotate(${rotation + 4}deg) scale(1.04)`, opacity: 1, offset: 0.7 },
        { transform: `rotate(${rotation}deg) scale(1)`, opacity: 1 },
      ],
      { duration: 380, easing: "cubic-bezier(.2,.8,.2,1)" },
    );
  }, [open, animate, rev, rotation]);

  useEffect(() => {
    if (!open || !animate || !cycles) return;
    const iv = setInterval(() => setTick((n) => n + 1), TICK_MS);
    const to = setTimeout(() => setSettledRev(rev), CYCLE_MS);
    return () => {
      clearInterval(iv);
      clearTimeout(to);
    };
  }, [open, animate, cycles, rev]);

  if (!result) return null;

  const cycleName = !settled && pool.length ? pool[tick % pool.length]! : null;

  return (
    <div
      className="fixed inset-0 z-[55]"
      data-testid="tool-result"
      data-kind={result.kind}
      data-settled={settled ? "true" : "false"}
    >
      <button
        type="button"
        aria-label={t("tools.result.dismiss")}
        className="absolute inset-0 bg-black/75"
        data-testid="tool-result-dismiss"
        onClick={dismiss}
      />
      <div className="pointer-events-none absolute inset-0 flex items-center justify-center p-4">
        <div
          ref={cardRef}
          role="dialog"
          aria-modal="true"
          aria-label={t("tools.result.title")}
          aria-live="polite"
          style={{ transform: `rotate(${rotation}deg)` }}
          className="flex w-[min(100%,22rem)] flex-col items-center gap-5 rounded-[2rem] bg-surface p-6 text-fg shadow-2xl"
        >
          {result.kind === "dice" && <DiceView r={result} />}
          {result.kind === "coin" && <CoinView r={result} />}
          {(result.kind === "player" || result.kind === "opponent") && (
            <SeatView r={result} settled={settled} cycleName={cycleName} />
          )}
          <div className="flex w-full flex-col gap-2">
            {request && (
              <Button
                className="pointer-events-auto"
                variant="primary"
                size="lg"
                block
                data-testid="tool-result-again"
                onClick={() => run(request)}
              >
                {t("tools.result.rollAgain")}
              </Button>
            )}
            <span className="text-center text-sm text-fg-subtle">{t("tools.result.dismiss")}</span>
          </div>
        </div>
      </div>
    </div>
  );
}
