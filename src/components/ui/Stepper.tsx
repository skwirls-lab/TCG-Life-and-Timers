"use client";
import { Minus, Plus } from "lucide-react";
import { IconButton } from "./Button";

interface Props {
  value: number;
  onChange: (v: number) => void;
  min?: number;
  max?: number;
  step?: number;
  label: string;
  testId?: string;
  format?: (v: number) => string;
}

export function Stepper({
  value,
  onChange,
  min = -Infinity,
  max = Infinity,
  step = 1,
  label,
  testId,
  format,
}: Props) {
  return (
    <div className="flex items-center gap-1" role="group" aria-label={label} data-testid={testId}>
      <IconButton
        label={`${label} −`}
        onClick={() => onChange(Math.max(min, value - step))}
        disabled={value <= min}
        className="bg-surface-2"
      >
        <Minus size={20} />
      </IconButton>
      <span
        className="min-w-12 text-center text-xl tabular"
        aria-live="polite"
        data-testid={testId ? `${testId}-value` : undefined}
      >
        {format ? format(value) : value}
      </span>
      <IconButton
        label={`${label} +`}
        onClick={() => onChange(Math.min(max, value + step))}
        disabled={value >= max}
        className="bg-surface-2"
      >
        <Plus size={20} />
      </IconButton>
    </div>
  );
}
