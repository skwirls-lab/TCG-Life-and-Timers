"use client";
/** LIFE-002 / TOK-001 / TOK-004 badges row; tapping a badge opens the counters tab (LIFE-003). */
import { useMemo } from "react";
import { GameIcon } from "@/components/icons/GameIcon";
import { t } from "@/lib/i18n";
import { useSeat } from "@/state/gameStore";
import { useSetting } from "@/state/settingsStore";
import { seatBadges, type BadgeView } from "./boardHelpers";

interface Props {
  index: number;
  seatId: string;
  onOpen: (counterId: string) => void;
}

export function Badges({ index, seatId, onOpen }: Props) {
  const mode = useSetting("badges");
  const key = useSeat(seatId, (_s, g) => JSON.stringify(seatBadges(g, seatId, mode)));
  const badges = useMemo(() => (key ? (JSON.parse(key) as BadgeView[]) : []), [key]);
  if (badges.length === 0) return null;
  return (
    <div
      data-testid={`seat-${index}-badges`}
      className="pointer-events-auto flex min-w-0 flex-wrap items-center justify-end gap-1"
    >
      {badges.map((b) => (
        <button
          key={b.key}
          type="button"
          data-testid={`seat-${index}-badge-${b.key}`}
          aria-label={t("board.badge.label", { name: b.name, value: b.text })}
          onClick={() => onOpen(b.counterId)}
          className="flex h-12 min-w-12 items-center justify-center gap-1 rounded-full px-1"
        >
          <span className="flex items-center gap-1 rounded-full bg-black/60 px-2 py-1 text-sm font-semibold tabular text-white">
            <GameIcon id={b.icon} size={18} />
            {b.text && <span>{b.text}</span>}
          </span>
        </button>
      ))}
    </div>
  );
}
