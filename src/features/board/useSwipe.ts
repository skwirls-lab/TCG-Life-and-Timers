"use client";
/**
 * INP-005 swipe-to-change on a seat tile. Pointer handlers for the tile's rotated content box:
 * each pointer is tracked on its own (multi-touch keeps working, INP-001); a vertical swipe in the
 * seat player's frame that starts in the number band fires once per gesture. The +/− halves keep
 * their tap/hold detection: a swipe moves past useHold's tolerance, which cancels the tap.
 */
import { useCallback, useEffect, useRef } from "react";
import { toLocal, type Rotation } from "@/lib/ui/rotation";
import { classifySwipe, type SwipeDirection } from "@/lib/ui/swipe";

interface Options {
  enabled: boolean;
  rotation: Rotation;
  /** The band (px from the tile's top, in the player's frame) where a swipe may start. */
  top: number;
  bottom: number;
  onSwipe: (dir: SwipeDirection) => void;
}

export function useSwipe({ enabled, rotation, top, bottom, onSwipe }: Options) {
  const pointers = useRef(new Map<number, { x: number; y: number; done: boolean }>());
  const swallowClick = useRef(false);
  const opts = useRef({ rotation, top, bottom, onSwipe });
  useEffect(() => {
    opts.current = { rotation, top, bottom, onSwipe };
  }, [rotation, top, bottom, onSwipe]);

  const onPointerDown = useCallback((e: React.PointerEvent<HTMLElement>) => {
    const o = opts.current;
    const box = e.currentTarget.getBoundingClientRect();
    const local = toLocal(
      o.rotation,
      e.clientX - box.left,
      e.clientY - box.top,
      box.width,
      box.height,
    );
    if (local.y < o.top || local.y > o.bottom) return;
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY, done: false });
  }, []);

  const onPointerMove = useCallback((e: React.PointerEvent<HTMLElement>) => {
    const p = pointers.current.get(e.pointerId);
    if (!p || p.done) return;
    const dir = classifySwipe(opts.current.rotation, e.clientX - p.x, e.clientY - p.y);
    if (!dir) return;
    p.done = true;
    swallowClick.current = true;
    opts.current.onSwipe(dir);
  }, []);

  const onPointerEnd = useCallback((e: React.PointerEvent<HTMLElement>) => {
    const p = pointers.current.get(e.pointerId);
    pointers.current.delete(e.pointerId);
    // The click that follows a swipe's pointerup must not open the calculator / seat menu.
    if (p?.done) setTimeout(() => (swallowClick.current = false), 0);
  }, []);

  const onClickCapture = useCallback((e: React.MouseEvent) => {
    if (!swallowClick.current) return;
    swallowClick.current = false;
    e.stopPropagation();
    e.preventDefault();
  }, []);

  if (!enabled) return null;
  return {
    onPointerDown,
    onPointerMove,
    onPointerUp: onPointerEnd,
    onPointerCancel: onPointerEnd,
    onClickCapture,
  };
}
