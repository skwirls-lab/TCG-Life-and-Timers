"use client";
import { Check } from "lucide-react";
import { useState } from "react";
import { Segmented } from "@/components/ui";
import type { ArtRef, SeatId } from "@/engine";
import { t, type MessageKey } from "@/lib/i18n";
import { cn } from "@/lib/ui/cn";
import { useDispatch } from "@/state/gameStore";
import { GRADIENTS, PALETTE, gradientFor, solidFromHue } from "./gradients";

interface Props {
  seatId: SeatId;
  art?: ArtRef;
}

type Mode = "gradients" | "solid";

/**
 * "Colors" background picker (SET-002): 16 curated gradients, 8 palette solids + a hue slider,
 * and "Default". Applies SEAT_SET_ART and the seat accent color (history dots) via SEAT_SET_COLOR.
 */
export function ColorsPicker({ seatId, art }: Props) {
  const dispatch = useDispatch();
  const [mode, setMode] = useState<Mode>(art?.kind === "solid" ? "solid" : "gradients");
  const [hue, setHue] = useState(200);
  const selectedGradient = art?.kind === "gradient" ? gradientFor(art.value)?.id : undefined;
  const selectedSolid = art?.kind === "solid" ? art.value.toLowerCase() : undefined;

  const apply = (next: ArtRef | undefined, color?: string) => {
    dispatch({ type: "SEAT_SET_ART", seatId, art: next });
    if (color) dispatch({ type: "SEAT_SET_COLOR", seatId, color });
  };

  const swatch = "relative aspect-square min-h-12 rounded-xl border border-white/20";
  return (
    <div className="flex flex-col gap-3" data-testid="bg-colors">
      <Segmented<Mode>
        label={t("seat.bg.colors")}
        value={mode}
        onChange={setMode}
        testId="bg-mode"
        options={[
          { value: "gradients", label: t("seat.bg.gradients") },
          { value: "solid", label: t("seat.bg.solid") },
        ]}
      />
      {mode === "gradients" ? (
        <div className="grid grid-cols-4 gap-2" role="group" aria-label={t("seat.bg.gradients")}>
          {GRADIENTS.map((g) => {
            const selected = selectedGradient === g.id;
            return (
              <button
                key={g.id}
                type="button"
                data-testid={`bg-gradient-${g.id}`}
                aria-pressed={selected}
                aria-label={t(`seat.gradient.${g.id}` as MessageKey)}
                title={t(`seat.gradient.${g.id}` as MessageKey)}
                className={cn(swatch, selected && "ring-4 ring-accent")}
                style={{ background: g.css }}
                onClick={() => apply({ kind: "gradient", value: g.css }, g.accent)}
              >
                {selected && <Check className="absolute inset-0 m-auto text-white" />}
              </button>
            );
          })}
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          <div className="grid grid-cols-4 gap-2" role="group" aria-label={t("seat.bg.solid")}>
            {PALETTE.map((c, i) => {
              const selected = selectedSolid === c.toLowerCase();
              return (
                <button
                  key={c}
                  type="button"
                  data-testid={`bg-solid-${i}`}
                  aria-pressed={selected}
                  aria-label={t("seat.bg.paletteColor", { n: i + 1 })}
                  className={cn(swatch, selected && "ring-4 ring-accent")}
                  style={{ background: c }}
                  onClick={() => apply({ kind: "solid", value: c }, c)}
                >
                  {selected && <Check className="absolute inset-0 m-auto text-black" />}
                </button>
              );
            })}
          </div>
          <label className="flex items-center gap-3">
            <span className="shrink-0 text-sm text-fg-muted">{t("seat.bg.hue")}</span>
            <input
              type="range"
              min={0}
              max={359}
              value={hue}
              data-testid="bg-hue"
              className="h-12 flex-1"
              style={{
                background:
                  "linear-gradient(90deg, #f00, #ff0, #0f0, #0ff, #00f, #f0f, #f00) center / 100% 0.5rem no-repeat",
              }}
              onChange={(e) => {
                const h = Number(e.target.value);
                setHue(h);
                const c = solidFromHue(h);
                apply({ kind: "solid", value: c }, c);
              }}
            />
          </label>
        </div>
      )}
      <button
        type="button"
        data-testid="bg-default"
        aria-pressed={!art || art.kind === "default"}
        className="min-h-12 rounded-xl border border-border px-4 text-left hover:bg-surface-2"
        onClick={() => apply(undefined)}
      >
        {t("seat.bg.default")}
      </button>
    </div>
  );
}
