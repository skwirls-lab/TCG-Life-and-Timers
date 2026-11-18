"use client";
/**
 * Settings › Timers › Different time per seat (TMR-060). Edits a local copy and applies once:
 * idle clocks take it at once; started clocks ask to restart (a structure change, §13.1-C).
 */
import { useState } from "react";
import { Button } from "@/components/ui";
import type { TimerConfig } from "@/engine";
import type { SettingsContext } from "@/features/settings/registry";
import { t } from "@/lib/i18n";
import { compactExtra, seatTimesOn } from "./seatTimes";
import { SeatTimesEditor } from "./SeatTimesEditor";

interface Props {
  ctx: SettingsContext;
  onApply: (patch: Partial<TimerConfig>) => void;
}

export function SeatTimesPage({ ctx, onApply }: Props) {
  const cfg = ctx.draft.timer;
  const [on, setOn] = useState(seatTimesOn(cfg));
  const [extra, setExtra] = useState<Record<string, number>>({ ...cfg.seatExtraMs });
  const seats = ctx.game?.seats ?? [];
  const next = on ? compactExtra(extra) : undefined;
  const dirty =
    on !== seatTimesOn(cfg) ||
    JSON.stringify(next ?? null) !==
      JSON.stringify(cfg.seatExtraMs ? compactExtra(cfg.seatExtraMs) : null);
  return (
    <div className="mt-4 flex flex-col gap-4">
      <SeatTimesEditor
        config={cfg}
        on={on}
        rows={seats.map((s) => ({ key: s.id, name: s.name, extraMs: extra[s.id] ?? 0 }))}
        onToggle={setOn}
        onSeat={(id, ms) => setExtra((e) => ({ ...e, [id]: ms }))}
      />
      <div className="sticky bottom-0 bg-bg/95 py-3 backdrop-blur">
        <Button
          variant="primary"
          size="lg"
          block
          disabled={!dirty}
          onClick={() => onApply({ seatExtraMs: next })}
          data-testid="seat-times-apply"
        >
          {t("shell.settings.apply")}
        </Button>
      </div>
    </div>
  );
}
