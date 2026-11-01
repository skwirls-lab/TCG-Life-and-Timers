"use client";
/**
 * CUS-004 live seat preview: a static seat tile rendered from the draft preset (the board's
 * SeatTile reads the global game store, so it can't render a draft). Mirrors the tile anatomy:
 * name pill, the primary start value large with −/+ glyphs, and the badges row.
 */
import { Minus, Plus } from "lucide-react";
import { GameIcon } from "@/components/icons/GameIcon";
import { SEAT_COLORS, type CounterDefinition, type Preset } from "@/engine";
import { defaultSeatBackground, formatValue } from "@/features/board/boardHelpers";
import { t } from "@/lib/i18n";
import { cn } from "@/lib/ui/cn";

function badgeText(c: CounterDefinition): string {
  if (c.kind === "boolean" || c.kind === "token") return "";
  if (c.kind === "enum") return c.enumValues?.[c.start] ?? "";
  return formatValue(c.start);
}

/** Badge counters for a seat, in preset order (globals live on the toolbar, tokens on holders). */
export function previewBadges(p: Preset): { counter: CounterDefinition; hidden: boolean }[] {
  return p.counters
    .filter(
      (c) =>
        !c.isPrimary &&
        c.enabledByDefault &&
        c.visibility === "badge" &&
        (c.scope === "player" || c.scope === "playerVsOpponent"),
    )
    .map((c) => ({ counter: c, hidden: !c.showWhenDefault }));
}

export function PreviewTile({ preset }: { preset: Preset }) {
  const primaries = preset.counters.filter((c) => c.isPrimary);
  const primary = primaries.length === 1 ? primaries[0] : undefined;
  const color = SEAT_COLORS[0];
  const badges = previewBadges(preset);
  return (
    <figure
      data-testid="preview-tile"
      aria-label={t("builder.editor.preview")}
      className="relative mx-auto flex aspect-[4/3] w-full max-w-sm flex-col overflow-hidden rounded-3xl text-white shadow-lg"
      style={{ background: defaultSeatBackground(color) }}
    >
      <div className="flex h-12 items-center justify-center">
        <span className="rounded-full bg-black/55 px-3 py-1 text-sm font-semibold">
          {t("builder.editor.previewPlayer")}
        </span>
      </div>
      <div className="flex flex-1 items-center justify-between px-4">
        <Minus aria-hidden size={36} className="opacity-80" />
        <div className="flex flex-col items-center">
          {primary && (
            <span className="flex items-center gap-1 text-sm opacity-90">
              <GameIcon id={primary.icon} size={16} />
              {primary.shortName ?? primary.name}
            </span>
          )}
          <span
            data-testid="preview-value"
            className="text-7xl font-bold leading-none tabular drop-shadow"
          >
            {primary ? formatValue(primary.start) : "—"}
          </span>
        </div>
        <Plus aria-hidden size={36} className="opacity-80" />
      </div>
      <div className="flex min-h-12 flex-wrap items-center justify-end gap-1 px-2 pb-2">
        {badges.map(({ counter, hidden }) => (
          <span
            key={counter.id}
            data-testid={`preview-badge-${counter.id}`}
            title={hidden ? t("builder.editor.previewHidden") : undefined}
            className={cn(
              "flex items-center gap-1 rounded-full bg-black/60 px-2 py-1 text-sm font-semibold tabular",
              hidden && "opacity-60 outline-1 outline-dashed outline-white/60",
            )}
          >
            <GameIcon id={counter.icon} size={18} />
            <span>{counter.shortName ?? badgeText(counter)}</span>
            {counter.shortName && badgeText(counter) && <span>{badgeText(counter)}</span>}
          </span>
        ))}
      </div>
    </figure>
  );
}
