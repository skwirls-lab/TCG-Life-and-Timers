"use client";
/**
 * Focal point / zoom editor (ART-004): drag to move, pinch (two pointers) or the slider to zoom,
 * arrow keys / +/- for keyboard users. The frame has the seat's aspect as its player sees it, and
 * drags are un-rotated when the seat menu sheet is turned toward a sideways or opposite seat.
 */
import { useEffect, useRef, useState, type KeyboardEvent, type PointerEvent } from "react";
import type { ArtFocal } from "@/engine";
import {
  DEFAULT_FOCAL,
  focalLayerStyle,
  MAX_ZOOM,
  MIN_ZOOM,
  normalizeFocal,
  panFocal,
  pointerDistance,
  screenToLocalDelta,
  transformAngle,
  zoomFocal,
  type Size,
} from "@/lib/art/focal";
import { t } from "@/lib/i18n";

interface Props {
  src: string;
  focal: ArtFocal;
  onChange: (f: ArtFocal) => void;
  /** frame width / height (the seat as its player sees it) */
  aspect: number;
}

/** Sum of the rotations applied to `el` and its ancestors (deg). */
function cumulativeAngle(el: Element | null): number {
  let deg = 0;
  for (let n = el; n; n = n.parentElement) deg += transformAngle(getComputedStyle(n).transform);
  return ((deg % 360) + 360) % 360;
}

function useNaturalSize(src: string): Size | undefined {
  const [size, setSize] = useState<{ src: string; s: Size } | undefined>();
  useEffect(() => {
    let live = true;
    const img = new Image();
    img.onload = () => {
      if (live) setSize({ src, s: { width: img.naturalWidth, height: img.naturalHeight } });
    };
    img.src = src;
    return () => {
      live = false;
    };
  }, [src]);
  return size?.src === src ? size.s : undefined;
}

export function FocalEditor({ src, focal, onChange, aspect }: Props) {
  const frame = useRef<HTMLDivElement>(null);
  const natural = useNaturalSize(src);
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const gesture = useRef<{ angle: number; dist: number; zoom: number } | null>(null);
  const f = normalizeFocal(focal);

  const box = (): Size => ({
    width: frame.current?.offsetWidth ?? 0,
    height: frame.current?.offsetHeight ?? 0,
  });
  // Until the image size is known, treat it as square (pans still feel right for art crops).
  const img = (): Size => natural ?? { width: 1, height: 1 };

  const onPointerDown = (e: PointerEvent<HTMLDivElement>) => {
    e.currentTarget.setPointerCapture?.(e.pointerId);
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    const pts = [...pointers.current.values()];
    gesture.current = {
      angle: cumulativeAngle(frame.current),
      dist: pts.length >= 2 ? pointerDistance(pts[0]!, pts[1]!) : 0,
      zoom: f.zoom,
    };
  };

  const onPointerMove = (e: PointerEvent<HTMLDivElement>) => {
    const prev = pointers.current.get(e.pointerId);
    const g = gesture.current;
    if (!prev || !g) return;
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    const pts = [...pointers.current.values()];
    if (pts.length >= 2) {
      const d = pointerDistance(pts[0]!, pts[1]!);
      if (g.dist > 0) onChange(zoomFocal(f, (g.zoom * d) / g.dist));
      return;
    }
    const local = screenToLocalDelta(e.clientX - prev.x, e.clientY - prev.y, g.angle);
    onChange(panFocal(f, local, box(), img()));
  };

  const onPointerUp = (e: PointerEvent<HTMLDivElement>) => {
    pointers.current.delete(e.pointerId);
    const pts = [...pointers.current.values()];
    gesture.current =
      pts.length > 0 ? { angle: gesture.current?.angle ?? 0, dist: 0, zoom: f.zoom } : null;
  };

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    const step = 12;
    const moves: Record<string, { dx: number; dy: number }> = {
      ArrowLeft: { dx: step, dy: 0 },
      ArrowRight: { dx: -step, dy: 0 },
      ArrowUp: { dx: 0, dy: step },
      ArrowDown: { dx: 0, dy: -step },
    };
    const m = moves[e.key];
    if (m) {
      e.preventDefault();
      onChange(panFocal(f, m, box(), img()));
    } else if (e.key === "+" || e.key === "=") {
      e.preventDefault();
      onChange(zoomFocal(f, f.zoom + 0.1));
    } else if (e.key === "-") {
      e.preventDefault();
      onChange(zoomFocal(f, f.zoom - 0.1));
    }
  };

  return (
    <div className="flex flex-col items-center gap-3" data-testid="art-focal">
      <p className="self-start text-sm text-fg-muted">{t("art.focal.help")}</p>
      <div
        ref={frame}
        role="img"
        tabIndex={0}
        aria-label={t("art.focal.frame")}
        data-testid="art-focal-frame"
        data-focal={`${f.x.toFixed(3)},${f.y.toFixed(3)},${f.zoom.toFixed(3)}`}
        className="relative cursor-grab touch-none select-none overflow-hidden rounded-2xl border-2 border-white/40 bg-surface-2 outline-none focus-visible:ring-4 focus-visible:ring-accent"
        style={{
          aspectRatio: String(aspect),
          // at most 16rem (and 45% of the short screen edge) tall, so it fits rotated sheets
          width: `min(100%, ${(16 * aspect).toFixed(2)}rem, ${(45 * aspect).toFixed(2)}vmin)`,
        }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        onKeyDown={onKeyDown}
      >
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0"
          style={{ backgroundImage: `url("${src.replace(/"/g, "%22")}")`, ...focalLayerStyle(f) }}
        />
      </div>
      <div className="flex w-full items-center gap-3">
        <label className="flex flex-1 items-center gap-3">
          <span className="shrink-0 text-sm text-fg-muted">{t("art.focal.zoom")}</span>
          <input
            type="range"
            min={MIN_ZOOM}
            max={MAX_ZOOM}
            step={0.05}
            value={f.zoom}
            data-testid="art-zoom"
            className="h-12 flex-1 accent-accent"
            onChange={(e) => onChange(zoomFocal(f, Number(e.target.value)))}
          />
        </label>
        <button
          type="button"
          data-testid="art-focal-reset"
          className="min-h-12 rounded-xl border border-border px-3 text-sm hover:bg-surface-2"
          onClick={() => onChange(DEFAULT_FOCAL)}
        >
          {t("art.focal.reset")}
        </button>
      </div>
    </div>
  );
}
