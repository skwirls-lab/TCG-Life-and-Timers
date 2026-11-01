"use client";
/**
 * CMD-002 on-tile commander-damage mini-grid and CMD-006 quick commander-damage grid.
 * Cells are placed spatially like the board as seen by the tile's player (`miniGrid` from the
 * layout engine); each cell is tinted with the source seat's art/colour when colorizeMiniGrids.
 */
import { useMemo, type CSSProperties } from "react";
import type { MiniGrid as MiniGridPlacement } from "@/engine/layout";
import { useHold } from "@/lib/hooks/useHold";
import { t } from "@/lib/i18n";
import { cn } from "@/lib/ui/cn";
import { useDispatch, useSeat } from "@/state/gameStore";
import { useSetting } from "@/state/settingsStore";
import { artStyle, damageSummary, type DamageSummary } from "./boardHelpers";
import { tapFeedback } from "./feedback";
import type { SeatLook } from "./useSeatLooks";

interface GridProps {
  index: number;
  seatId: string;
  grid: MiniGridPlacement;
  looks: SeatLook[];
}

function useDamage(seatId: string): Map<string, DamageSummary> {
  const key = useSeat(seatId, (_s, g) => JSON.stringify(damageSummary(g, seatId)));
  return useMemo(() => {
    const list = key ? (JSON.parse(key) as DamageSummary[]) : [];
    return new Map(list.map((d) => [d.sourceSeatId, d]));
  }, [key]);
}

function cellBackground(look: SeatLook | undefined, colorize: boolean): CSSProperties {
  if (!colorize || !look) return { background: "var(--color-surface-3)" };
  const s = artStyle(look.art, look.color);
  // Mini cells never zoom; keep only the paint.
  return {
    background: s.background,
    backgroundImage: s.backgroundImage,
    backgroundSize: s.backgroundSize,
    backgroundPosition: s.backgroundPosition,
  };
}

function cellText(d: DamageSummary | undefined): string {
  if (!d) return "";
  if (d.values.length > 1) return d.values.some((v) => v > 0) ? d.values.join("|") : "";
  const v = d.values[0] ?? 0;
  return v > 0 ? String(v) : "";
}

function gridStyle(grid: MiniGridPlacement): CSSProperties {
  return {
    gridTemplateColumns: `repeat(${grid.cols}, 1fr)`,
    gridTemplateRows: `repeat(${grid.rows}, 1fr)`,
  };
}

/** Small read-only grid on the tile; tapping it opens the seat menu's commander tab. */
export function TileMiniGrid({
  index,
  seatId,
  grid,
  looks,
  cellPx,
  onOpen,
}: GridProps & { cellPx: number; onOpen: () => void }) {
  const damage = useDamage(seatId);
  const colorize = useSetting("colorizeMiniGrids");
  const cell = `${cellPx}px`;
  return (
    <button
      type="button"
      data-testid={`seat-${index}-cmdgrid`}
      aria-label={t("board.cmd.open")}
      onClick={onOpen}
      className="pointer-events-auto grid min-h-12 min-w-12 shrink-0 gap-0.5 rounded-lg bg-black/40 p-1"
      style={{ ...gridStyle(grid), gridAutoRows: cell }}
    >
      {grid.cells.map((c) => {
        const look = looks[c.index];
        const d = look ? damage.get(look.id) : undefined;
        const self = look?.id === seatId;
        const text = cellText(d);
        return (
          <span
            key={c.index}
            data-testid={`seat-${index}-cmd-${c.index}`}
            data-value={d ? d.values.reduce((a, b) => a + b, 0) : 0}
            className="relative flex items-center justify-center overflow-hidden rounded-[0.3rem] font-bold leading-none tabular text-white"
            style={{
              ...cellBackground(look, colorize),
              gridColumn: c.col + 1,
              gridRow: c.row + 1,
              fontSize: Math.max(7, Math.round(cellPx * 0.55)),
              width: cell,
              height: cell,
            }}
          >
            <span aria-hidden className="absolute inset-0 bg-black/45" />
            <span className="relative [text-shadow:0_1px_2px_#000]">
              {self && !text ? t("board.cmd.me") : text}
            </span>
          </span>
        );
      })}
    </button>
  );
}

interface CellButtonProps {
  testId: string;
  label: string;
  onAdd: (delta: number) => void;
  className?: string;
  style?: CSSProperties;
  children: React.ReactNode;
}

/** Tap = +1, hold = −1 (CMD-006). */
function CmdCellButton({ testId, label, onAdd, className, style, children }: CellButtonProps) {
  const delay = useSetting("holdDelayMs");
  const hold = useHold({ delay, onTap: () => onAdd(1), onHold: () => onAdd(-1) });
  return (
    <button
      type="button"
      data-testid={testId}
      aria-label={label}
      className={cn("relative flex min-h-12 min-w-12 items-center justify-center", className)}
      style={style}
      {...hold}
      onClick={(e) => {
        if (e.detail === 0) onAdd(1); // keyboard activation
      }}
    >
      {children}
    </button>
  );
}

/** CMD-006: the whole tile becomes an opponent grid. */
export function QuickCmdGrid({ index, seatId, grid, looks }: GridProps) {
  const damage = useDamage(seatId);
  const colorize = useSetting("colorizeMiniGrids");
  const dispatch = useDispatch();
  const add = (sourceSeatId: string, sourceIndex: number, delta: number) => {
    dispatch({ type: "CMD_DAMAGE_ADD", targetSeatId: seatId, sourceSeatId, sourceIndex, delta });
    tapFeedback();
  };
  return (
    <div
      className="pointer-events-auto grid size-full gap-1.5"
      style={gridStyle(grid)}
      data-testid={`seat-${index}-cmdquick`}
    >
      {grid.cells.map((c) => {
        const look = looks[c.index];
        if (!look) return null;
        const d = damage.get(look.id);
        const self = look.id === seatId;
        const values = d?.values ?? [0];
        const name = self ? t("board.cmd.me") : look.name;
        const pos: CSSProperties = { gridColumn: c.col + 1, gridRow: c.row + 1 };
        const label = (v: number, k: number) =>
          t("board.cmd.cellLabel", {
            source: values.length > 1 ? `${look.name} (${k + 1})` : look.name,
            value: v,
          });
        const inner = (v: number) => (
          <>
            <span aria-hidden className="absolute inset-0 bg-black/45" />
            <span className="relative flex flex-col items-center leading-none text-white [text-shadow:0_1px_3px_#000]">
              <span className="text-[min(18cqh,2.75rem)] font-bold tabular">{v}</span>
            </span>
          </>
        );
        return (
          <div
            key={c.index}
            className="relative flex min-h-0 min-w-0 flex-col overflow-hidden rounded-xl"
            style={{ ...cellBackground(look, colorize), ...pos }}
            data-testid={values.length > 1 ? `seat-${index}-cmd-${c.index}` : undefined}
          >
            <span className="pointer-events-none absolute inset-x-0 top-0 z-10 truncate bg-black/60 px-1 text-center text-[0.7rem] font-semibold leading-5 text-white">
              {name}
            </span>
            <div className="flex min-h-0 flex-1">
              {values.map((v, k) => (
                <CmdCellButton
                  key={k}
                  testId={
                    values.length > 1
                      ? `seat-${index}-cmd-${c.index}-${k}`
                      : `seat-${index}-cmd-${c.index}`
                  }
                  label={label(v, k)}
                  onAdd={(delta) => add(look.id, k, delta)}
                  className={cn("flex-1 pt-4", k > 0 && "border-l border-white/40")}
                >
                  {inner(v)}
                </CmdCellButton>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}
