"use client";
/**
 * The rotated per-seat menu (PRD §8.2, SEAT-001/002/004/005): Player / Counters /
 * Commander damage / Timer tabs, in a Sheet turned toward the seat's player.
 * The board opens it when a seat's name pill (or a badge / mini-grid) is tapped and passes the
 * seat's layout rotation; a per-seat override (LAY-004) wins over it.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { Sheet, Tabs } from "@/components/ui";
import type { Game, Rotation, SeatId } from "@/engine";
import { CommanderTab } from "@/features/commander/CommanderTab";
import { matrixCounter } from "@/features/commander/damage";
import { t } from "@/lib/i18n";
import { useGameStore } from "@/state/gameStore";
import { CountersTab } from "./CountersTab";
import { PlayerTab } from "./PlayerTab";
import { SeatTimerTab, seatTimerTabVisible } from "./SeatTimerTab";

export type SeatMenuTab = "player" | "counters" | "commander" | "timer";

export interface SeatMenuProps {
  seatId: string;
  open: boolean;
  onClose: () => void;
  initialTab?: SeatMenuTab;
  /** counter to highlight when opened from a badge (LIFE-003) */
  focusCounterId?: string;
  /** the seat's layout rotation (from the board's layout engine); default 0 */
  rotation?: Rotation;
}

/** Tabs available for a game (commander tab only with a commander-damage counter). */
export function seatMenuTabs(game: Game): SeatMenuTab[] {
  const tabs: SeatMenuTab[] = ["player", "counters"];
  if (matrixCounter(game)) tabs.push("commander");
  if (seatTimerTabVisible(game)) tabs.push("timer");
  return tabs;
}

const TAB_LABEL = {
  player: "seat.tab.player",
  counters: "seat.tab.counters",
  commander: "seat.tab.commander",
  timer: "seat.tab.timer",
} as const;

export function SeatMenu({
  seatId,
  open,
  onClose,
  initialTab,
  focusCounterId,
  rotation = 0,
}: SeatMenuProps) {
  const game = useGameStore((s) => s.session?.game);
  // Stable close handler: the Sheet re-runs its focus effect when onClose changes identity.
  const closeRef = useRef(onClose);
  useEffect(() => {
    closeRef.current = onClose;
  }, [onClose]);
  const close = useCallback(() => closeRef.current(), []);
  const seat = game?.seats.find((s) => s.id === seatId);
  if (!open || !game || !seat) return null;
  const effective = seat.rotationOverride ?? rotation;
  return (
    <Sheet
      open={open}
      onClose={close}
      rotation={effective}
      title={t("seat.menu.title", { name: seat.name })}
      testId="seat-menu"
      // Sideways panels are wider than the viewport: keep the flex wrapper from shrinking them.
      className="shrink-0"
    >
      <SeatMenuBody
        game={game}
        seatId={seatId}
        rotation={effective}
        initialTab={initialTab ?? (focusCounterId ? "counters" : "player")}
        focusCounterId={focusCounterId}
      />
    </Sheet>
  );
}

function SeatMenuBody({
  game,
  seatId,
  rotation,
  initialTab,
  focusCounterId,
}: {
  game: Game;
  seatId: SeatId;
  rotation: Rotation;
  initialTab: SeatMenuTab;
  focusCounterId?: string;
}) {
  const tabs = seatMenuTabs(game);
  const [tab, setTab] = useState<SeatMenuTab>(tabs.includes(initialTab) ? initialTab : "player");
  const seat = game.seats.find((s) => s.id === seatId)!;
  const current = tabs.includes(tab) ? tab : "player";
  return (
    <div className="flex flex-col gap-3">
      <div className="sticky top-0 z-10 -mx-4 bg-surface px-4">
        <Tabs<SeatMenuTab>
          label={t("seat.menu.tabs")}
          value={current}
          onChange={setTab}
          testId="seat-menu-tab"
          tabs={tabs.map((v) => ({ value: v, label: t(TAB_LABEL[v]) }))}
        />
      </div>
      <div
        role="tabpanel"
        aria-label={t(TAB_LABEL[current])}
        data-testid={`seat-menu-panel-${current}`}
      >
        {current === "player" && <PlayerTab game={game} seat={seat} rotation={rotation} />}
        {current === "counters" && (
          <CountersTab game={game} seatId={seatId} focusCounterId={focusCounterId} />
        )}
        {current === "commander" && <CommanderTab game={game} seatId={seatId} />}
        {current === "timer" && <SeatTimerTab seatId={seatId} />}
      </div>
    </div>
  );
}
