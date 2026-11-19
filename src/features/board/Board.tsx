"use client";
/**
 * The board: measures its box, asks the layout engine for seat rects/rotations (T1.6) and renders
 * one SeatTile per seat plus the menu. Re-renders only when the seat list, layout inputs or
 * board-level settings change — never on counter changes (PERF-002).
 *
 * MENU: with the default "center" menu style there is no toolbar strip — the seats take its room
 * and the center menu button sits on the seam point (the centre of the layout's zero-thickness
 * toolbar rect). One seat keeps a strip-sized band for the button; a shared track (Digimon
 * memory, D-073) keeps its strip, with the button in place of the strip's buttons. The legacy
 * "strip" style renders the toolbar as before (lazy).
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { getLayout, miniGrid, seatFrameSize, TOOLBAR_PX, type MiniGrid } from "@/engine/layout";
import type { Rotation } from "@/lib/ui/rotation";
import { useGameValue } from "@/state/gameStore";
import { useSetting } from "@/state/settingsStore";
import { hasCommanderDamage, trackGlobals } from "./boardHelpers";
import { CenterMenuButton } from "./CenterMenuButton";
import { centerCover, seatNotch } from "./notch";
import { Toolbar } from "./lazySheets";
import { SeatTile } from "./SeatTile";
import { useSeatLooks } from "./useSeatLooks";

/** Extra toolbar thickness for a shared track row, px (A-4). */
const TRACK_PX = 56;

/** Gutter between tiles, px (half on each side of a tile). */
const GAP = 3;

function useBoxSize(ref: React.RefObject<HTMLElement | null>) {
  const [size, setSize] = useState<{ w: number; h: number } | null>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const read = () => {
      const r = el.getBoundingClientRect();
      setSize((s) =>
        s && Math.abs(s.w - r.width) < 0.5 && Math.abs(s.h - r.height) < 0.5
          ? s
          : { w: r.width, h: r.height },
      );
    };
    read();
    const ro = new ResizeObserver(read);
    ro.observe(el);
    return () => ro.disconnect();
  }, [ref]);
  return size;
}

export function Board() {
  const ref = useRef<HTMLDivElement>(null);
  const size = useBoxSize(ref);
  const seatIds = useGameValue((g) => g.seats.map((s) => s.id)) ?? [];
  const overrides = useGameValue((g) => g.seats.map((s) => s.rotationOverride ?? -1)) ?? [];
  const layoutId = useGameValue((g) => g.layoutId);
  const showMiniGrid = useGameValue(hasCommanderDamage) ?? false;
  // A-4: a shared track (Digimon memory) gets a thicker toolbar strip.
  const hasTrack = useGameValue((g) => trackGlobals(g).length > 0) ?? false;
  const cameraMode = useSetting("cameraMode");
  const onePlayer = useSetting("onePlayerMode");
  const strip = useSetting("menuStyle") === "strip";
  const hasMatch = useGameValue((g) => g.timer.match !== undefined) ?? false;
  const looks = useSeatLooks();
  const players = seatIds.length;
  const overridesKey = overrides.join(",");
  const single = onePlayer || players === 1;

  const computed = useMemo(() => {
    if (!size || players === 0) return null;
    const ov = overridesKey
      .split(",")
      .map((v) => (v === "-1" ? undefined : (Number(v) as Rotation)));
    // Strip thickness: the legacy strip; else only a shared track or a lone seat needs a band.
    const toolbarPx = hasTrack
      ? TOOLBAR_PX + TRACK_PX
      : strip
        ? TOOLBAR_PX
        : single
          ? TOOLBAR_PX
          : 0;
    const input = {
      players,
      variantId: layoutId,
      viewport: size,
      cameraMode,
      overrides: ov,
      toolbarPx,
    };
    const layout = getLayout({ ...input, onePlayer });
    // One-player mode keeps the whole table's arrangement for the commander grid (SET-032).
    const tableLayout = onePlayer ? getLayout(input) : layout;
    const grids = new Map<number, MiniGrid>();
    for (const s of layout.seats) grids.set(s.index, miniGrid(tableLayout, s.index));
    // MENU: where the center button (on the seam) cuts into each seat's name row.
    const notches = new Map<number, [number, number]>();
    if (toolbarPx === 0) {
      const r = layout.toolbar.rect;
      const cover = centerCover((r.x + r.w / 2) * size.w, (r.y + r.h / 2) * size.h, hasMatch);
      for (const s of layout.seats) {
        const tile = {
          left: s.rect.x * size.w + GAP,
          top: s.rect.y * size.h + GAP,
          right: (s.rect.x + s.rect.w) * size.w - GAP,
          bottom: (s.rect.y + s.rect.h) * size.h - GAP,
        };
        const n = seatNotch(tile, s.rotation, cover);
        if (n) notches.set(s.index, n);
      }
    }
    return { layout, grids, notches };
  }, [
    size,
    players,
    layoutId,
    cameraMode,
    onePlayer,
    overridesKey,
    hasTrack,
    strip,
    single,
    hasMatch,
  ]);

  const tb = computed?.layout.toolbar;
  const vertical = tb?.orientation === "vertical";
  const seatRotations = computed?.layout.seats.map((s) => s.rotation);

  return (
    <div ref={ref} className="relative size-full" data-testid="board" data-board-root>
      {computed && size && (
        <>
          {computed.layout.seats.map((s) => {
            const seatId = seatIds[s.index];
            if (!seatId) return null;
            const frame = seatFrameSize(s, size);
            return (
              <div
                key={seatId}
                className="absolute"
                style={{
                  left: `${s.rect.x * 100}%`,
                  top: `${s.rect.y * 100}%`,
                  width: `${s.rect.w * 100}%`,
                  height: `${s.rect.h * 100}%`,
                  padding: GAP,
                }}
              >
                <SeatTile
                  index={s.index}
                  seatId={seatId}
                  rotation={s.rotation}
                  wide={frame.w >= frame.h}
                  frameW={Math.max(0, frame.w - 2 * GAP)}
                  frameH={Math.max(0, frame.h - 2 * GAP)}
                  grid={computed.grids.get(s.index)!}
                  looks={looks}
                  showMiniGrid={showMiniGrid}
                  notch={computed.notches.get(s.index) ?? null}
                />
              </div>
            );
          })}
          {tb && (strip || hasTrack) && (
            <Toolbar
              rect={tb.rect}
              orientation={tb.orientation}
              {...(seatRotations ? { seatRotations } : {})}
              {...(strip ? {} : { centerSlot: <CenterMenuButton vertical={vertical} /> })}
            />
          )}
          {tb && !strip && !hasTrack && (
            <div
              className="pointer-events-none absolute z-20 [&>*]:pointer-events-auto"
              data-testid="center-menu-anchor"
              style={{
                left: `${(tb.rect.x + tb.rect.w / 2) * 100}%`,
                top: `${(tb.rect.y + tb.rect.h / 2) * 100}%`,
                transform: "translate(-50%, -50%)",
              }}
            >
              <CenterMenuButton vertical={vertical} />
            </div>
          )}
        </>
      )}
    </div>
  );
}
