"use client";
/**
 * §10.6 shared center track (`display: "track"` global counters, e.g. the Digimon memory gauge
 * from −10 to +10), drawn in the toolbar strip between the seats (A-4).
 *
 * Ownership (2 players): seat 1 in seat order owns the positive side, seat 2 the negative side.
 * Each player's side lies on their own right-hand side of the strip (`trackPlusAtEnd`), so on a
 * top/bottom table both players read "my memory is on my right". Each half is tinted with its
 * owner's colour and labelled with their name, facing them. Tapping a half (or its end button)
 * moves the marker one step toward that end; holding moves `holdStep`.
 */
import { ChevronLeft, ChevronRight, ChevronDown, ChevronUp } from "lucide-react";
import type { CSSProperties } from "react";
import { globalValue, type CounterDefinition } from "@/engine";
import { useHold } from "@/lib/hooks/useHold";
import { t } from "@/lib/i18n";
import { cn } from "@/lib/ui/cn";
import type { Rotation } from "@/lib/ui/rotation";
import { useDispatch, useGameValue } from "@/state/gameStore";
import { useSetting } from "@/state/settingsStore";
import { trackPlusAtEnd } from "./boardHelpers";

/** Owner name labels sit on the half's edge nearest their player, reading toward them. */
const LABEL_EDGE: Record<Rotation, string> = {
  0: "inset-x-11 bottom-0",
  180: "inset-x-11 top-0",
  90: "inset-y-11 left-0",
  270: "inset-y-11 right-0",
};
const LABEL_STYLE: Record<Rotation, CSSProperties> = {
  0: {},
  180: { transform: "rotate(180deg)" },
  90: { writingMode: "vertical-rl" },
  270: { writingMode: "vertical-rl", transform: "rotate(180deg)" },
};

export interface TrackOwner {
  name: string;
  color: string;
  rotation: Rotation;
}

interface Props {
  def: CounterDefinition;
  vertical: boolean;
  /** [positive side owner, negative side owner] (2-player games). */
  owners: [TrackOwner, TrackOwner] | null;
}

export function TrackGauge({ def, vertical, owners }: Props) {
  const dispatch = useDispatch();
  const value = useGameValue((g) => globalValue(g, def.id)) ?? 0;
  const delay = useSetting("holdDelayMs");
  const min = def.min ?? -10;
  const max = def.max ?? 10;
  const step = def.step || 1;
  const holdStep = def.holdStep ?? step * 3;
  const plusAtEnd = trackPlusAtEnd(vertical ? "vertical" : "horizontal", owners?.[0].rotation ?? 0);

  const move = (delta: number) => {
    const next = Math.max(min, Math.min(max, value + delta));
    if (next !== value) dispatch({ type: "COUNTER_ADD", counterId: def.id, delta: next - value });
  };
  // "start" = left / top end of the strip.
  const towardStart = plusAtEnd ? -1 : 1;
  const startHold = useHold({
    delay,
    onTap: () => move(towardStart * step),
    onHold: () => move(towardStart * holdStep),
  });
  const endHold = useHold({
    delay,
    onTap: () => move(-towardStart * step),
    onHold: () => move(-towardStart * holdStep),
  });

  // Cells from the start end to the far end.
  const cells: number[] = [];
  for (let v = min; v <= max; v++) cells.push(v);
  if (!plusAtEnd) cells.reverse();
  const startOwner = owners ? (plusAtEnd ? owners[1] : owners[0]) : null;
  const endOwner = owners ? (plusAtEnd ? owners[0] : owners[1]) : null;
  const sideName = (v: number) =>
    v === 0 || !owners ? "" : v > 0 ? owners[0].name : owners[1].name;
  const valueLabel = owners
    ? value === 0
      ? t("board.track.valueZero", { name: def.name })
      : t("board.track.valueSide", { name: def.name, n: Math.abs(value), side: sideName(value) })
    : t("board.track.value", { name: def.name, n: value });

  const StartIcon = vertical ? ChevronUp : ChevronLeft;
  const EndIcon = vertical ? ChevronDown : ChevronRight;
  const endLabel = (owner: TrackOwner | null, dir: number) =>
    owner
      ? t("board.track.toward", { name: def.name, side: owner.name })
      : t(dir > 0 ? "board.track.increase" : "board.track.decrease", { name: def.name });

  const half = (which: "start" | "end") => {
    const owner = which === "start" ? startOwner : endOwner;
    const hold = which === "start" ? startHold : endHold;
    const dir = which === "start" ? towardStart : -towardStart;
    return (
      <button
        type="button"
        data-testid={`track-${def.id}-${which}`}
        aria-label={endLabel(owner, dir)}
        className={cn(
          "relative flex min-h-11 min-w-11 flex-1 items-center outline-none focus-visible:bg-white/10",
          vertical ? "flex-col" : "flex-row",
          which === "end" && (vertical ? "flex-col-reverse" : "flex-row-reverse"),
        )}
        style={owner ? { background: `color-mix(in srgb, ${owner.color} 28%, transparent)` } : {}}
        {...hold}
        onClick={(e) => {
          if (e.detail === 0) move(dir * step);
        }}
      >
        <span className="flex size-11 shrink-0 items-center justify-center text-fg">
          {which === "start" ? <StartIcon size={22} /> : <EndIcon size={22} />}
        </span>
        {owner && (
          <span
            aria-hidden
            data-testid={`track-${def.id}-${which}-owner`}
            className={cn(
              "pointer-events-none absolute flex items-center justify-center overflow-hidden",
              LABEL_EDGE[owner.rotation],
            )}
          >
            <span
              className="max-w-[7rem] truncate text-[0.6rem] font-semibold leading-tight text-fg/90"
              style={LABEL_STYLE[owner.rotation]}
            >
              {owner.name}
            </span>
          </span>
        )}
      </button>
    );
  };

  return (
    <div
      data-testid={`track-${def.id}`}
      data-value={value}
      data-plus-at-end={plusAtEnd ? "1" : "0"}
      role="group"
      aria-label={valueLabel}
      className={cn(
        "relative flex shrink-0 overflow-hidden rounded-2xl bg-surface-2",
        vertical ? "h-full w-full max-w-14 flex-col" : "h-12 w-full max-w-[32rem] flex-row",
      )}
    >
      {half("start")}
      {half("end")}
      {/* The scale and marker sit over the two halves; taps go through to them. */}
      <div
        aria-hidden
        className={cn(
          "pointer-events-none absolute flex items-center justify-between",
          vertical ? "inset-x-0 inset-y-11 flex-col" : "inset-y-0 inset-x-11 flex-row",
        )}
      >
        {cells.map((v) => {
          const on = v === value;
          const owner = v === 0 || !owners ? null : v > 0 ? owners[0] : owners[1];
          return (
            <span
              key={v}
              className="flex min-h-0 min-w-0 flex-1 items-center justify-center overflow-visible"
            >
              <span
                data-testid={on ? `track-${def.id}-marker` : undefined}
                className={cn(
                  "flex shrink-0 items-center justify-center rounded-full font-bold tabular leading-none",
                  on
                    ? "z-10 size-8 text-sm text-black shadow-lg ring-2 ring-white"
                    : "text-[0.6rem] text-fg-muted",
                )}
                style={on ? { background: owner?.color ?? "#fff" } : undefined}
              >
                {on ? Math.abs(v) : Math.abs(v) % 5 === 0 ? Math.abs(v) : "·"}
              </span>
            </span>
          );
        })}
      </div>
      <span className="sr-only" aria-live="polite">
        {valueLabel}
      </span>
    </div>
  );
}
