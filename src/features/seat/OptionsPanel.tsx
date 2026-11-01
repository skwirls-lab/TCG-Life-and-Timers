"use client";
import { ArrowLeft, Minus, RotateCcw } from "lucide-react";
import type { ReactNode } from "react";
import { Button, IconButton, Keypad, type KeypadResult } from "@/components/ui";
import { t } from "@/lib/i18n";

interface Props {
  title: string;
  /** current value shown in the header */
  valueLabel: string;
  onBack: () => void;
  onMinus?: () => void;
  minusLabel?: string;
  /** set-exact via the keypad (set mode) */
  onSet?: (value: number) => void;
  onReset?: () => void;
  children?: ReactNode;
  testId: string;
}

/** Keypad set-mode result → a value ("-5" means set −5). */
export function keypadValue(r: KeypadResult): number {
  return r.op === "sub" ? -r.value : r.value;
}

/**
 * Hold options for a counter / commander-damage cell (§8.2): −1, set exact, reset, plus extra
 * controls (enable/disable for this game, enum states, token give/clear).
 */
export function OptionsPanel({
  title,
  valueLabel,
  onBack,
  onMinus,
  minusLabel,
  onSet,
  onReset,
  children,
  testId,
}: Props) {
  return (
    <div className="flex flex-col gap-3" data-testid={testId}>
      <div className="flex items-center gap-2">
        <IconButton label={t("common.back")} onClick={onBack} data-testid={`${testId}-back`}>
          <ArrowLeft size={24} />
        </IconButton>
        <h3 className="flex-1 truncate text-lg font-semibold">{title}</h3>
        <output className="text-2xl tabular" data-testid={`${testId}-value`}>
          {valueLabel}
        </output>
      </div>
      <div className="flex flex-wrap gap-2">
        {onMinus && (
          <Button icon={<Minus size={20} />} onClick={onMinus} data-testid={`${testId}-minus`}>
            {minusLabel ?? t("seat.options.minusOne")}
          </Button>
        )}
        {onReset && (
          <Button icon={<RotateCcw size={20} />} onClick={onReset} data-testid={`${testId}-reset`}>
            {t("seat.options.reset")}
          </Button>
        )}
        {children}
      </div>
      {onSet && (
        <div className="flex flex-col gap-1">
          <span className="text-sm text-fg-muted">{t("seat.options.setExact")}</span>
          <Keypad
            mode="set"
            testId={`${testId}-keypad`}
            submitLabel={t("seat.options.set")}
            onSubmit={(r) => onSet(keypadValue(r))}
          />
        </div>
      )}
    </div>
  );
}
