"use client";
/**
 * TOOL-010 quick access: the board renders this when its 🎲 toolbar button is HELD. A compact
 * popover over the board with every die, the coin, randomize player and randomize opponent.
 * Tapping an item — or releasing the hold on it after sliding the finger over — fires it and
 * shows the shared result overlay (centered: invoked from the toolbar, TOOL-007). The menu
 * reports `onClose` once it is dismissed or the result overlay is closed, so it works whether
 * the board keeps it mounted or mounts it only while open.
 */
import { useEffect, useRef, useState, type ReactNode } from "react";
import { Shuffle, Swords, X } from "lucide-react";
import { IconButton } from "@/components/ui";
import { aliveSeats } from "@/engine";
import { t } from "@/lib/i18n";
import { ALL_DICE } from "@/lib/random";
import { useGameStore } from "@/state/gameStore";
import { CoinIcon, DieIcon } from "./DieIcon";
import { SeatPicker } from "./SeatPicker";
import { ToolResultOverlay } from "./ToolResultOverlay";
import type { ToolRequest } from "./tools";
import { ensureSettingsLoaded, useToolResult } from "./useToolRunner";

export interface QuickToolsMenuProps {
  open: boolean;
  onClose: () => void;
}

type Item = { id: string; label: string; icon: ReactNode; req: ToolRequest | "opponent" };

/** Slide distance (px) before a release counts as "release on an item". */
const RELEASE_SLOP = 16;

export function QuickToolsMenu({ open, onClose }: QuickToolsMenuProps) {
  const run = useToolResult((s) => s.run);
  const hasResult = useToolResult((s) => s.result !== null);
  const alive = useGameStore((s) => (s.session ? aliveSeats(s.session.game).length : 0));
  const [picking, setPicking] = useState(false);
  const [fired, setFired] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef(onClose);
  useEffect(() => {
    closeRef.current = onClose;
  }, [onClose]);

  useEffect(() => ensureSettingsLoaded(), []);

  const items: Item[] = [
    ...ALL_DICE.map((sides) => ({
      id: `d${sides}`,
      label: t("tools.die", { sides }),
      icon: <DieIcon sides={sides} size={40} className="text-accent" />,
      req: { kind: "dice", sides } as ToolRequest,
    })),
    {
      id: "coin",
      label: t("tools.flipCoin"),
      icon: <CoinIcon size={40} className="text-warning" />,
      req: { kind: "coin" },
    },
    {
      id: "player",
      label: t("tools.randomPlayer"),
      icon: <Shuffle size={32} aria-hidden />,
      req: { kind: "player" },
    },
    {
      id: "opponent",
      label: t("tools.randomOpponent"),
      icon: <Swords size={32} aria-hidden />,
      req: "opponent",
    },
  ];

  const disabled = (it: Item) =>
    (it.id === "player" && alive === 0) || (it.id === "opponent" && alive < 2);

  const fireRef = useRef<(id: string) => void>(() => {});
  const fire = (id: string) => {
    const it = items.find((x) => x.id === id);
    if (!it || disabled(it)) return;
    if (it.req === "opponent") {
      setPicking(true);
      return;
    }
    if (run(it.req)) setFired(true);
  };
  useEffect(() => {
    fireRef.current = fire;
  });

  // "Release on an item": the hold that opened the menu ends with a pointerup somewhere; if the
  // finger slid onto an item, fire it. A release where the hold started is ignored.
  useEffect(() => {
    if (!open || fired) return;
    let origin: { x: number; y: number } | null = null;
    let downInside = false;
    const onMove = (e: PointerEvent) => {
      if (!origin) origin = { x: e.clientX, y: e.clientY };
    };
    const onDown = () => {
      downInside = true;
    };
    const onUp = (e: PointerEvent) => {
      if (downInside) return;
      const start = origin ?? { x: e.clientX, y: e.clientY };
      if (Math.hypot(e.clientX - start.x, e.clientY - start.y) < RELEASE_SLOP) return;
      const el = document.elementFromPoint(e.clientX, e.clientY)?.closest("[data-quick-item]");
      const id = el?.getAttribute("data-quick-item");
      if (id) fireRef.current(id);
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerdown", onDown);
    window.addEventListener("pointerup", onUp);
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerdown", onDown);
      window.removeEventListener("pointerup", onUp);
    };
  }, [open, fired]);

  useEffect(() => {
    if (!open || fired) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && closeRef.current();
    window.addEventListener("keydown", onKey);
    rootRef.current?.focus();
    return () => window.removeEventListener("keydown", onKey);
  }, [open, fired]);

  const finish = () => {
    setFired(false);
    setPicking(false);
    closeRef.current();
  };

  if (fired || (hasResult && open)) {
    return <ToolResultOverlay onDismiss={finish} />;
  }
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50" data-testid="quick-tools">
      <button
        type="button"
        aria-label={t("common.close")}
        className="absolute inset-0 bg-black/60"
        onClick={finish}
      />
      <div className="pointer-events-none absolute inset-0 flex items-center justify-center p-3">
        <div
          ref={rootRef}
          role="dialog"
          aria-modal="true"
          aria-label={t("tools.quick.title")}
          tabIndex={-1}
          className="pointer-events-auto w-[min(100%,24rem)] rounded-[2rem] bg-surface p-3 text-fg shadow-2xl outline-none"
        >
          <div className="flex items-center gap-2 px-1">
            <h2 className="flex-1 text-lg font-semibold">{t("tools.quick.title")}</h2>
            <IconButton label={t("common.close")} onClick={finish} data-testid="quick-tools-close">
              <X size={24} />
            </IconButton>
          </div>
          {picking ? (
            <SeatPicker
              className="p-1"
              onCancel={() => setPicking(false)}
              onPick={(seatId) => {
                setPicking(false);
                if (run({ kind: "opponent", chooserId: seatId })) setFired(true);
              }}
            />
          ) : (
            <>
              <p className="px-1 text-sm text-fg-muted">{t("tools.quick.hint")}</p>
              <ul className="mt-2 grid grid-cols-4 gap-2">
                {items.map((it) => (
                  <li key={it.id}>
                    <button
                      type="button"
                      data-quick-item={it.id}
                      data-testid={`quick-${it.id}`}
                      disabled={disabled(it)}
                      onClick={() => fire(it.id)}
                      className="flex min-h-20 w-full flex-col items-center justify-center gap-1 rounded-2xl bg-surface-2 p-1 text-xs leading-tight disabled:opacity-40"
                    >
                      {it.icon}
                      <span className="line-clamp-2 text-center">{it.label}</span>
                    </button>
                  </li>
                ))}
              </ul>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
