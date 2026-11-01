"use client";
import { create } from "zustand";
import { useCallback, useEffect, type CSSProperties } from "react";
import {
  anchorPlacement,
  registerSeatAnchor,
  seatAnchorRect,
  type AnchorRect,
} from "@/lib/ui/anchor";
import type { Rotation } from "@/lib/ui/rotation";

/**
 * Seat anchor (D-043 / D-058): show the snackbar near a seat, facing its player. With `seatId` and
 * a tile registered through `useSeatAnchor`, it sits toward the player's edge of that tile;
 * otherwise it sits just beyond `rect` (e.g. the button that was tapped, left uncovered) on the
 * side away from the player; with neither it falls back to the centred stack.
 */
export interface SnackAnchor {
  rotation?: Rotation;
  seatId?: string;
  rect?: AnchorRect;
  /** Where on a registered seat tile: toward the player's edge (default 'seat') or centred. */
  region?: "seat" | "center" | "above";
}

export interface SnackItem {
  id: number;
  message: string;
  actionLabel?: string;
  onAction?: () => void;
  durationMs: number;
  rotation?: Rotation;
  anchor?: SnackAnchor;
}

interface SnackStore {
  items: SnackItem[];
  /** A-8: full-screen overlays (PAUSED) hide snackbars while they are up (a count). */
  suppressed: number;
  suppress: () => () => void;
  show: (item: Omit<SnackItem, "id" | "durationMs"> & { durationMs?: number }) => number;
  dismiss: (id: number) => void;
}

let nextId = 1;
export const useSnackbar = create<SnackStore>((set) => ({
  items: [],
  suppressed: 0,
  suppress: () => {
    set((s) => ({ suppressed: s.suppressed + 1 }));
    let done = false;
    return () => {
      if (done) return;
      done = true;
      set((s) => ({ suppressed: Math.max(0, s.suppressed - 1) }));
    };
  },
  show: (item) => {
    const id = nextId++;
    set((s) => ({ items: [...s.items.slice(-2), { durationMs: 3000, ...item, id }] }));
    return id;
  },
  dismiss: (id) => set((s) => ({ items: s.items.filter((i) => i.id !== id) })),
}));

/**
 * Ref callback for a seat tile so seat-anchored snackbars can find it:
 * `const anchorRef = useSeatAnchor(seatId); <div ref={anchorRef}>`.
 */
export function useSeatAnchor(seatId: string): (el: Element | null) => (() => void) | undefined {
  return useCallback(
    (el: Element | null) => (el ? registerSeatAnchor(seatId, el) : undefined),
    [seatId],
  );
}

/** Fixed-position style for an anchored item (null = the centred stack). */
function anchoredStyle(item: SnackItem): CSSProperties | null {
  const a = item.anchor;
  if (!a || typeof window === "undefined") return null;
  const seatRect = seatAnchorRect(a.seatId);
  const rect = seatRect ?? a.rect;
  if (!rect) return null;
  const rotation = a.rotation ?? item.rotation ?? 0;
  const region = seatRect ? (a.region ?? "seat") : (a.region ?? "above");
  const p = anchorPlacement(rect, rotation, region, {
    width: window.innerWidth,
    height: window.innerHeight,
  });
  return {
    position: "absolute",
    left: p.x,
    top: p.y,
    width: "max-content",
    maxWidth: p.maxWidth,
    transform: `translate(-50%, -50%) rotate(${p.rotation}deg)`,
  };
}

function SnackView({ item }: { item: SnackItem }) {
  const dismiss = useSnackbar((s) => s.dismiss);
  useEffect(() => {
    const timer = setTimeout(() => dismiss(item.id), item.durationMs);
    return () => clearTimeout(timer);
  }, [item.id, item.durationMs, dismiss]);
  const anchored = anchoredStyle(item);
  return (
    <div
      role="status"
      data-testid="snackbar"
      data-anchored={anchored ? "1" : undefined}
      style={anchored ?? { transform: `rotate(${item.anchor?.rotation ?? item.rotation ?? 0}deg)` }}
      className="pointer-events-auto flex min-h-12 items-center gap-3 rounded-2xl bg-surface-3 px-4 py-2 text-fg shadow-xl"
    >
      <span className="flex-1">{item.message}</span>
      {item.actionLabel && (
        <button
          type="button"
          data-testid="snackbar-action"
          className="min-h-12 rounded-lg px-3 font-semibold text-accent"
          onClick={() => {
            item.onAction?.();
            dismiss(item.id);
          }}
        >
          {item.actionLabel}
        </button>
      )}
    </div>
  );
}

export function SnackbarHost() {
  const items = useSnackbar((s) => s.items);
  const hidden = useSnackbar((s) => s.suppressed > 0);
  return (
    <div
      className="pointer-events-none fixed inset-0 z-[60] flex flex-col items-center justify-center gap-2 p-4"
      style={hidden ? { display: "none" } : undefined}
      data-suppressed={hidden || undefined}
    >
      {items.map((i) => (
        <SnackView key={i.id} item={i} />
      ))}
    </div>
  );
}
