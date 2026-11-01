"use client";
/**
 * The board: measures its box, asks the layout engine for seat rects/rotations (T1.6) and renders
 * one SeatTile per seat plus the toolbar. Re-renders only when the seat list, layout inputs or
 * board-level settings change — never on counter changes (PERF-002).
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { getLayout, miniGrid, seatFrameSize, TOOLBAR_PX, type MiniGrid } from "@/engine/layout";
import type { Rotation } from "@/lib/ui/rotation";
import { useGameValue } from "@/state/gameStore";
import { useSetting } from "@/state/settingsStore";
import { hasCommanderDamage, trackGlobals } from "./boardHelpers";
import { SeatTile } from "./SeatTile";
import { Toolbar } from "./Toolbar";
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
  const looks = useSeatLooks();
  const players = seatIds.length;
  const overridesKey = overrides.join(",");

  const computed = useMemo(() => {
    if (!size || players === 0) return null;
    const ov = overridesKey
      .split(",")
      .map((v) => (v === "-1" ? undefined : (Number(v) as Rotation)));
    const input = {
      players,
      variantId: layoutId,
      viewport: size,
      cameraMode,
      overrides: ov,
      ...(hasTrack ? { toolbarPx: TOOLBAR_PX + TRACK_PX } : {}),
    };
    const layout = getLayout({ ...input, onePlayer });
    // One-player mode keeps the whole table's arrangement for the commander grid (SET-032).
    const tableLayout = onePlayer ? getLayout(input) : layout;
    const grids = new Map<number, MiniGrid>();
    for (const s of layout.seats) grids.set(s.index, miniGrid(tableLayout, s.index));
    return { layout, grids };
  }, [size, players, layoutId, cameraMode, onePlayer, overridesKey, hasTrack]);

  return (
    <div ref={ref} className="relative size-full" data-testid="board">
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
                />
              </div>
            );
          })}
          <Toolbar
            rect={computed.layout.toolbar.rect}
            orientation={computed.layout.toolbar.orientation}
            seatRotations={computed.layout.seats.map((s) => s.rotation)}
          />
        </>
      )}
    </div>
  );
}
