"use client";
/**
 * CMD-002 on-tile commander-damage mini-grid and CMD-006 quick commander-damage grid.
 * Cells are placed spatially like the board as seen by the tile's player (`miniGrid` from the
 * layout engine); each cell is tinted with the source seat's art/colour when colorizeMiniGrids.
 */
import { Fragment, memo, useMemo, type CSSProperties } from "react";
import { ArtBackground } from "@/features/art/ArtBackground";
import { artToCss } from "@/features/backgrounds/gradients";
import { isImageArt } from "@/lib/art/resolve";
import type { MiniGrid as MiniGridPlacement } from "@/engine/layout";
import { useHold } from "@/lib/hooks/useHold";
import { t } from "@/lib/i18n";
import { cn } from "@/lib/ui/cn";
import { useDispatch, useSeat } from "@/state/gameStore";
import { useSetting } from "@/state/settingsStore";
import { damageSummary, type DamageSummary } from "./boardHelpers";
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
  // Images paint in a CellArt layer (resolved like the tile); this is the colour/gradient base.
  return artToCss(isImageArt(look.art) ? undefined : look.art, look.color);
}

/** Image art of the source seat inside a tinted cell (uploads/offline copies resolve too). */
const CellArt = memo(function CellArt({
  look,
  colorize,
}: {
  look: SeatLook | undefined;
  colorize: boolean;
}) {
  const art = look?.art;
  if (!colorize || !look || !isImageArt(art)) return null;
  // Mini cells never zoom; keep the focal point only.
  const flat = art.focal ? { ...art, focal: { ...art.focal, zoom: 1 } } : art;
  return <ArtBackground art={flat} fallbackColor={look.color} className="absolute inset-0" />;
});

/**
 * Text per commander in a mini-grid cell: one entry, or one per partner (CMD-003) when any of
 * them has damage. Empty when there is nothing to show.
 */
export function cellValues(d: DamageSummary | undefined): string[] {
  if (!d) return [];
  if (d.values.length > 1) return d.values.some((v) => v > 0) ? d.values.map(String) : [];
  const v = d.values[0] ?? 0;
  return v > 0 ? [String(v)] : [];
}

function gridStyle(grid: MiniGridPlacement, auto = false): CSSProperties {
  return {
    // Split partner cells grow to fit both values ("14 | 12"), so columns size to content.
    gridTemplateColumns: `repeat(${grid.cols}, ${auto ? "auto" : "1fr"})`,
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
  const fontPx = Math.max(7, Math.round(cellPx * 0.55));
  return (
    <button
      type="button"
      data-testid={`seat-${index}-cmdgrid`}
      onClick={onOpen}
      className="pointer-events-auto grid min-h-12 min-w-12 shrink-0 gap-0.5 rounded-lg bg-black/40 p-1"
      style={{ ...gridStyle(grid, true), gridAutoRows: cell }}
    >
      <span className="sr-only">{t("board.cmd.open")}</span>
      {grid.cells.map((c) => {
        const look = looks[c.index];
        const d = look ? damage.get(look.id) : undefined;
        const self = look?.id === seatId;
        const values = cellValues(d);
        const split = values.length > 1;
        return (
          <span
            key={c.index}
            data-testid={`seat-${index}-cmd-${c.index}`}
            data-value={d ? d.values.reduce((a, b) => a + b, 0) : 0}
            data-split={split || undefined}
            className="relative flex items-center justify-center overflow-hidden rounded-[0.3rem] font-bold leading-none tabular text-white"
            style={{
              ...cellBackground(look, colorize),
              gridColumn: c.col + 1,
              gridRow: c.row + 1,
              fontSize: fontPx,
              // A-2: cells widen to show their values in full (partner "14 | 12", 3 digits).
              minWidth: cell,
              height: cell,
            }}
          >
            <CellArt look={look} colorize={colorize} />
            <span aria-hidden className="absolute inset-0 bg-black/45" />
            {split ? (
              <span className="relative flex items-center gap-[0.2em] px-[0.25em] [text-shadow:0_1px_2px_#000]">
                {values.map((v, k) => (
                  <Fragment key={k}>
                    {k > 0 && <span aria-hidden className="h-[0.9em] w-px bg-white/70" />}
                    <span
                      data-testid={`seat-${index}-cmd-${c.index}-v${k}`}
                      className="whitespace-nowrap"
                    >
                      {v}
                    </span>
                  </Fragment>
                ))}
              </span>
            ) : (
              <span
                data-testid={`seat-${index}-cmd-${c.index}-v0`}
                className="relative whitespace-nowrap [text-shadow:0_1px_2px_#000]"
              >
                {self && values.length === 0 ? t("board.cmd.me") : (values[0] ?? "")}
              </span>
            )}
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
            <CellArt look={look} colorize={colorize} />
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
