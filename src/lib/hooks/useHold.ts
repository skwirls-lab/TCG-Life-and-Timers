"use client";
import { useCallback, useEffect, useRef } from "react";

interface Options {
  /** ms before the hold fires */
  delay: number;
  /** fires once when the hold threshold is reached */
  onHold: () => void;
  /** fires on release before the threshold (a tap) */
  onTap?: () => void;
  /** if set, onHold repeats every `repeat` ms while held */
  repeat?: number;
  /** movement (px) that cancels the gesture */
  moveTolerance?: number;
}

/**
 * Pointer-based tap/hold detector. Each instance tracks its own pointer so many seats
 * can be pressed at the same time (INP-001, INP-004).
 */
export function useHold({ delay, onHold, onTap, repeat, moveTolerance = 12 }: Options) {
  const state = useRef<{
    id: number | null;
    x: number;
    y: number;
    held: boolean;
    timer: ReturnType<typeof setTimeout> | null;
    interval: ReturnType<typeof setInterval> | null;
  }>({
    id: null,
    x: 0,
    y: 0,
    held: false,
    timer: null,
    interval: null,
  });
  const cbs = useRef({ onHold, onTap });
  useEffect(() => {
    cbs.current = { onHold, onTap };
  }, [onHold, onTap]);

  const clear = useCallback(() => {
    const s = state.current;
    if (s.timer) clearTimeout(s.timer);
    if (s.interval) clearInterval(s.interval);
    s.timer = null;
    s.interval = null;
    s.id = null;
  }, []);

  useEffect(() => clear, [clear]);

  const onPointerDown = useCallback(
    (e: React.PointerEvent) => {
      if (state.current.id !== null) return;
      if (e.button !== undefined && e.button !== 0) return;
      const s = state.current;
      s.id = e.pointerId;
      s.x = e.clientX;
      s.y = e.clientY;
      s.held = false;
      s.timer = setTimeout(() => {
        s.held = true;
        cbs.current.onHold();
        if (repeat) s.interval = setInterval(() => cbs.current.onHold(), repeat);
      }, delay);
    },
    [delay, repeat],
  );

  const onPointerUp = useCallback(
    (e: React.PointerEvent) => {
      const s = state.current;
      if (s.id !== e.pointerId) return;
      const wasHeld = s.held;
      clear();
      if (!wasHeld) cbs.current.onTap?.();
    },
    [clear],
  );

  const onPointerMove = useCallback(
    (e: React.PointerEvent) => {
      const s = state.current;
      if (s.id !== e.pointerId) return;
      if (Math.hypot(e.clientX - s.x, e.clientY - s.y) > moveTolerance) clear();
    },
    [clear, moveTolerance],
  );

  const onPointerCancel = useCallback(
    (e: React.PointerEvent) => {
      if (state.current.id === e.pointerId) clear();
    },
    [clear],
  );

  return {
    onPointerDown,
    onPointerUp,
    onPointerMove,
    onPointerCancel,
    onPointerLeave: onPointerCancel,
    onContextMenu: (e: React.MouseEvent) => e.preventDefault(),
  };
}
