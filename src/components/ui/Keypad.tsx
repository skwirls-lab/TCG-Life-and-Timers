"use client";
import { Delete } from "lucide-react";
import { useState } from "react";
import { cn } from "@/lib/ui/cn";

export type KeypadMode = "set" | "calc";

export interface KeypadResult {
  op: "add" | "sub" | "set" | "half";
  value: number;
}

interface Props {
  mode?: KeypadMode;
  initial?: string;
  onSubmit: (r: KeypadResult) => void;
  testId?: string;
  submitLabel?: string;
}

/** Parse calculator input like "-1500", "+800", "=4000", "/2" or "25". */
export function parseKeypad(input: string, mode: KeypadMode): KeypadResult | null {
  const s = input.trim();
  if (!s) return null;
  if (s === "/2") return { op: "half", value: 2 };
  const m = /^([+\-=]?)(\d{1,7})$/.exec(s);
  if (!m) return null;
  const value = Number(m[2]);
  const sign = m[1];
  if (sign === "+") return { op: "add", value };
  if (sign === "-") return { op: "sub", value };
  if (sign === "=") return { op: "set", value };
  return mode === "set" ? { op: "set", value } : { op: "sub", value };
}

const KEYS = ["7", "8", "9", "4", "5", "6", "1", "2", "3"];

/** Numeric keypad for exact entry (set mode) and Yu-Gi-Oh!-style calculator (INP-007). */
export function Keypad({
  mode = "set",
  initial = "",
  onSubmit,
  testId,
  submitLabel = "OK",
}: Props) {
  const [input, setInput] = useState(initial);
  const parsed = parseKeypad(input, mode);
  const press = (k: string) => setInput((v) => (v + k).slice(0, 9));
  const btn = "min-h-14 rounded-xl bg-surface-2 text-2xl tabular active:bg-surface-3";
  return (
    <div className="flex flex-col gap-2" data-testid={testId}>
      <output
        className="min-h-14 rounded-xl bg-bg px-4 py-2 text-right text-3xl tabular"
        data-testid={testId ? `${testId}-display` : undefined}
      >
        {input || "0"}
      </output>
      <div className="grid grid-cols-4 gap-2">
        {mode === "calc" ? (
          <>
            <button
              type="button"
              className={btn}
              onClick={() => setInput((v) => "-" + v.replace(/^[+\-=]/, ""))}
            >
              −
            </button>
            <button
              type="button"
              className={btn}
              onClick={() => setInput((v) => "+" + v.replace(/^[+\-=]/, ""))}
            >
              +
            </button>
            <button
              type="button"
              className={btn}
              onClick={() => setInput((v) => "=" + v.replace(/^[+\-=]/, ""))}
            >
              =
            </button>
            <button type="button" className={btn} onClick={() => setInput("/2")}>
              ½
            </button>
          </>
        ) : (
          <>
            <button
              type="button"
              className={btn}
              onClick={() => setInput((v) => (v.startsWith("-") ? v.slice(1) : "-" + v))}
            >
              ±
            </button>
            <span />
            <span />
            <span />
          </>
        )}
        {KEYS.map((k, i) => (
          <button
            key={k}
            type="button"
            className={cn(btn, i % 3 === 0 && "col-start-1")}
            onClick={() => press(k)}
          >
            {k}
          </button>
        ))}
        <button
          type="button"
          className={btn}
          aria-label="Backspace"
          onClick={() => setInput((v) => v.slice(0, -1))}
        >
          <Delete className="mx-auto" />
        </button>
        <button type="button" className={btn} onClick={() => press("0")}>
          0
        </button>
        {mode === "calc" ? (
          <button type="button" className={btn} onClick={() => press("00")}>
            00
          </button>
        ) : (
          <span />
        )}
        <button
          type="button"
          data-testid={testId ? `${testId}-submit` : undefined}
          disabled={!parsed}
          className="col-span-4 min-h-14 rounded-xl bg-accent text-xl font-semibold text-accent-fg disabled:opacity-40"
          onClick={() => parsed && onSubmit(parsed)}
        >
          {submitLabel}
        </button>
      </div>
    </div>
  );
}
