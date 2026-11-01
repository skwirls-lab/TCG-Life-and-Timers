"use client";
import { create } from "zustand";
import { useEffect } from "react";
import type { Rotation } from "@/lib/ui/rotation";

export interface SnackItem {
  id: number;
  message: string;
  actionLabel?: string;
  onAction?: () => void;
  durationMs: number;
  rotation?: Rotation;
}

interface SnackStore {
  items: SnackItem[];
  show: (item: Omit<SnackItem, "id" | "durationMs"> & { durationMs?: number }) => number;
  dismiss: (id: number) => void;
}

let nextId = 1;
export const useSnackbar = create<SnackStore>((set) => ({
  items: [],
  show: (item) => {
    const id = nextId++;
    set((s) => ({ items: [...s.items.slice(-2), { durationMs: 3000, ...item, id }] }));
    return id;
  },
  dismiss: (id) => set((s) => ({ items: s.items.filter((i) => i.id !== id) })),
}));

function SnackView({ item }: { item: SnackItem }) {
  const dismiss = useSnackbar((s) => s.dismiss);
  useEffect(() => {
    const timer = setTimeout(() => dismiss(item.id), item.durationMs);
    return () => clearTimeout(timer);
  }, [item.id, item.durationMs, dismiss]);
  return (
    <div
      role="status"
      data-testid="snackbar"
      style={{ transform: `rotate(${item.rotation ?? 0}deg)` }}
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
  return (
    <div className="pointer-events-none fixed inset-0 z-[60] flex flex-col items-center justify-center gap-2 p-4">
      {items.map((i) => (
        <SnackView key={i.id} item={i} />
      ))}
    </div>
  );
}
