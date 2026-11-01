"use client";
/** Starting <primary> chips + Custom keypad (GAME-013, §13.1-A "Starting life"). */
import { useState } from "react";
import { Button, ChipRow, Keypad, Sheet } from "@/components/ui";
import { afterOverlayClose } from "@/features/settings/afterOverlayClose";
import { t } from "@/lib/i18n";

interface Props {
  label: string;
  values: number[];
  value: number;
  onChange: (v: number) => void;
  testId: string;
}

export function StartValuePicker({ label, values, value, onChange, testId }: Props) {
  const [custom, setCustom] = useState(false);
  const chips = values.includes(value) ? values : [...values, value];
  return (
    <div className="flex flex-wrap items-center gap-2">
      <ChipRow
        label={label}
        options={chips.map((v) => ({ value: v, label: String(v) }))}
        value={value}
        onChange={onChange}
        testId={testId}
      />
      <Button variant="ghost" onClick={() => setCustom(true)} data-testid={`${testId}-custom`}>
        {t("shell.start.custom")}
      </Button>
      <Sheet
        open={custom}
        onClose={() => setCustom(false)}
        title={label}
        testId={`${testId}-sheet`}
      >
        <Keypad
          mode="set"
          initial={String(value)}
          testId={`${testId}-keypad`}
          submitLabel={t("common.confirm")}
          onSubmit={(r) => {
            setCustom(false);
            if (r.op === "set" && r.value > 0) afterOverlayClose(() => onChange(r.value));
          }}
        />
      </Sheet>
    </div>
  );
}
