"use client";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { cn } from "@/lib/ui/cn";

interface Props {
  onConfirm: () => void;
  label: string;
  duration?: number;
  children: ReactNode;
  className?: string;
  testId?: string;
}

/** Hold-to-confirm button with a fill progress ring (LAY-011). Keyboard: Enter/Space confirms after hold too. */
export function HoldButton({
  onConfirm,
  label,
  duration = 1000,
  children,
  className,
  testId,
}: Props) {
  const [progress, setProgress] = useState(0);
  const start = useRef<number | null>(null);
  const raf = useRef<number | null>(null);

  const stop = () => {
    start.current = null;
    if (raf.current) cancelAnimationFrame(raf.current);
    raf.current = null;
    setProgress(0);
  };

  const tick = (ts: number) => {
    if (start.current === null) return;
    if (start.current < 0) start.current = ts;
    const p = Math.min(1, (ts - start.current) / duration);
    setProgress(p);
    if (p >= 1) {
      stop();
      onConfirm();
      return;
    }
    raf.current = requestAnimationFrame(tick);
  };

  useEffect(
    () => () => {
      if (raf.current) cancelAnimationFrame(raf.current);
    },
    [],
  );

  const begin = () => {
    start.current = -1; // set to the first frame timestamp
    raf.current = requestAnimationFrame(tick);
  };

  return (
    <button
      type="button"
      aria-label={label}
      data-testid={testId}
      onPointerDown={begin}
      onPointerUp={stop}
      onPointerLeave={stop}
      onPointerCancel={stop}
      onKeyDown={(e) => {
        if ((e.key === "Enter" || e.key === " ") && start.current === null) begin();
      }}
      onKeyUp={stop}
      onContextMenu={(e) => e.preventDefault()}
      className={cn("relative overflow-hidden", className)}
    >
      <span
        aria-hidden
        className="absolute inset-y-0 left-0 bg-danger/30"
        style={{ width: `${progress * 100}%` }}
      />
      <span className="relative">{children}</span>
    </button>
  );
}
