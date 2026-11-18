"use client";
/**
 * A profile's or deck's default background on the Profiles screen (PROF-010): a preview and a
 * sheet with the same art flow as the seat menu (Scryfall art with print choice + focal/zoom,
 * uploads, My images, "Use commander art") plus the gradient/solid colors.
 */
import { ImageIcon, Trash2 } from "lucide-react";
import { useState } from "react";
import { Button, SectionHeader, Sheet } from "@/components/ui";
import type { ArtRef } from "@/engine";
import { ArtBackground } from "@/features/art/ArtBackground";
import { ArtEditor } from "@/features/art/ArtPicker";
import { ColorsPicker } from "@/features/backgrounds/ColorsPicker";
import { t } from "@/lib/i18n";
import { artistCredit } from "@/lib/scryfall";

/** Board seats are roughly 3:2 as their player sees them; there is no seat to measure here. */
const PROFILE_ART_ASPECT = 1.5;

export interface BackgroundFieldProps {
  art: ArtRef | undefined;
  onChange: (art: ArtRef | undefined) => void;
  fallbackColor: string;
  help: string;
  /** names offered for one-tap commander art (decks) */
  commanderNames?: readonly string[];
  testId: string;
}

export function BackgroundField({
  art,
  onChange,
  fallbackColor,
  help,
  commanderNames = [],
  testId,
}: BackgroundFieldProps) {
  const [open, setOpen] = useState(false);
  const credit = art?.kind === "scryfall" ? artistCredit(art.artist, t("art.credit")) : undefined;
  const caption = art
    ? (art.cardName ?? (art.kind === "upload" ? t("art.picker.current") : t("seat.bg.colors")))
    : t("profiles.bg.none");
  return (
    <div className="flex flex-col gap-2" data-testid={testId}>
      <SectionHeader title={t("profiles.bg.title")} />
      <p className="text-sm text-fg-muted">{help}</p>
      <div className="flex items-center gap-3">
        <ArtBackground
          art={art}
          fallbackColor={fallbackColor}
          className="h-16 w-24 shrink-0 rounded-xl border border-border"
          testId={`${testId}-preview`}
        />
        <div className="flex min-w-0 flex-1 flex-col">
          <span className="truncate" data-testid={`${testId}-caption`}>
            {caption}
          </span>
          {credit && <span className="truncate text-xs text-fg-muted">{credit}</span>}
        </div>
      </div>
      <div className="flex flex-wrap gap-2">
        <Button
          icon={<ImageIcon size={20} />}
          data-testid={`${testId}-change`}
          onClick={() => setOpen(true)}
        >
          {t("profiles.bg.change")}
        </Button>
        {art && (
          <Button
            variant="ghost"
            icon={<Trash2 size={20} />}
            data-testid={`${testId}-remove`}
            onClick={() => onChange(undefined)}
          >
            {t("profiles.bg.remove")}
          </Button>
        )}
      </div>
      <Sheet
        open={open}
        onClose={() => setOpen(false)}
        title={t("profiles.bg.sheetTitle")}
        testId={`${testId}-sheet`}
      >
        <div className="flex flex-col gap-3">
          <ArtEditor
            art={art}
            onArt={onChange}
            commanderNames={commanderNames}
            aspect={PROFILE_ART_ASPECT}
          />
          <ColorsPicker art={art} onApply={(next) => onChange(next)} />
          <Button variant="primary" data-testid={`${testId}-done`} onClick={() => setOpen(false)}>
            {t("profiles.bg.done")}
          </Button>
        </div>
      </Sheet>
    </div>
  );
}

/** Small background thumbnail for the profile and deck lists. */
export function ArtThumb({
  art,
  fallbackColor,
  testId,
}: {
  art: ArtRef | undefined;
  fallbackColor: string;
  testId?: string;
}) {
  return (
    <ArtBackground
      art={art}
      fallbackColor={fallbackColor}
      className="size-8 rounded-lg border border-white/20"
      {...(testId ? { testId } : {})}
    />
  );
}
