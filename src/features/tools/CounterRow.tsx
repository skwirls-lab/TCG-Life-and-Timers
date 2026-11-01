"use client";
/** The − value + row shared by the Mana & Storm page (TOOL-011) and scratch counters (TOOL-012). */
import type { ReactNode } from "react";
import { Minus, Plus } from "lucide-react";
import { IconButton } from "@/components/ui";
import { t } from "@/lib/i18n";

interface Props {
  /** Accessible counter name (used in the − / + labels). */
  name: string;
  /** Visual label in the middle (a glyph, or an editable name). */
  label: ReactNode;
  value: number;
  onDelta: (d: number) => void;
  min: number;
  max: number;
  rowTestId: string;
  /** `${testIdBase}-minus|value|plus` */
  testIdBase: string;
  minusLabel?: string;
  plusLabel?: string;
  /** Extra trailing control (e.g. delete). */
  trailing?: ReactNode;
}

export function CounterRow({
  name,
  label,
  value,
  onDelta,
  min,
  max,
  rowTestId,
  testIdBase,
  minusLabel = t("tools.mana.minus", { name }),
  plusLabel = t("tools.mana.plus", { name }),
  trailing,
}: Props) {
  return (
    <li
      className="flex min-h-16 items-center gap-2 rounded-2xl bg-surface px-2 py-1"
      data-testid={rowTestId}
    >
      <IconButton
        label={minusLabel}
        onClick={() => onDelta(-1)}
        disabled={value <= min}
        className="bg-surface-2"
        data-testid={`${testIdBase}-minus`}
      >
        <Minus size={24} />
      </IconButton>
      <span className="flex min-w-0 flex-1 items-center justify-center gap-3" title={name}>
        {label}
        <span
          className="min-w-12 text-center text-4xl font-bold tabular"
          data-testid={`${testIdBase}-value`}
          aria-live="polite"
        >
          {value}
        </span>
      </span>
      <IconButton
        label={plusLabel}
        onClick={() => onDelta(1)}
        disabled={value >= max}
        className="bg-surface-2"
        data-testid={`${testIdBase}-plus`}
      >
        <Plus size={24} />
      </IconButton>
      {trailing}
    </li>
  );
}
