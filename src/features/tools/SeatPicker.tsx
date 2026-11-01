"use client";
/** TOOL-008 "Who's choosing?" — pick the chooser seat (living seats only) before randomizing. */
import { X } from "lucide-react";
import { IconButton } from "@/components/ui";
import { t } from "@/lib/i18n";
import { useGameStore } from "@/state/gameStore";

interface Props {
  onPick: (seatId: string) => void;
  onCancel: () => void;
  className?: string;
}

export function SeatPicker({ onPick, onCancel, className }: Props) {
  const all = useGameStore((s) => s.session?.game.seats);
  const seats = (all ?? []).filter((x) => !x.eliminated);
  return (
    <section
      className={className ?? "mt-3 rounded-2xl bg-surface p-3"}
      data-testid="seat-picker"
      aria-labelledby="seat-picker-title"
    >
      <div className="flex items-center gap-2">
        <h2 id="seat-picker-title" className="flex-1 text-lg font-semibold">
          {t("tools.whoChoosing")}
        </h2>
        <IconButton label={t("common.cancel")} onClick={onCancel} data-testid="seat-picker-cancel">
          <X size={22} />
        </IconButton>
      </div>
      <ul className="mt-2 grid grid-cols-2 gap-2">
        {seats.map((s, i) => (
          <li key={s.id}>
            <button
              type="button"
              data-testid={`seat-picker-${i}`}
              data-seat-id={s.id}
              onClick={() => onPick(s.id)}
              className="flex min-h-12 w-full items-center gap-2 rounded-xl bg-surface-2 px-3 text-left"
            >
              <span
                aria-hidden
                className="size-3 shrink-0 rounded-full"
                style={{ background: s.color }}
              />
              <span className="truncate">{s.name}</span>
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}
