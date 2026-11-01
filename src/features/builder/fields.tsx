"use client";
/** Small labelled form controls for the preset builder, with inline error slots (CUS-005). */
import { ChevronDown } from "lucide-react";
import { useId, useState, type ReactNode } from "react";
import { t } from "@/lib/i18n";
import { cn } from "@/lib/ui/cn";
import type { DraftIssue } from "./model";

export const inputCls =
  "min-h-12 w-full rounded-xl border border-border bg-surface-2 px-3 text-base text-fg placeholder:text-fg-subtle focus-visible:outline-2 focus-visible:outline-accent aria-[invalid=true]:border-danger";

export function FieldErrors({ id, issues }: { id: string; issues: readonly DraftIssue[] }) {
  if (issues.length === 0) return null;
  return (
    <ul id={id} className="mt-1 flex flex-col gap-0.5" data-testid="field-error">
      {issues.map((i) => (
        <li key={i.message} className="text-sm text-danger" role="alert">
          {t(i.message, i.vars)}
        </li>
      ))}
    </ul>
  );
}

interface BaseProps {
  label: string;
  hint?: string;
  issues?: readonly DraftIssue[];
  testId?: string;
  className?: string;
}

function Field({
  label,
  hint,
  issues = [],
  className,
  children,
}: BaseProps & { children: (ids: { input: string; describedBy?: string }) => ReactNode }) {
  const input = useId();
  const errId = `${input}-err`;
  const hintId = `${input}-hint`;
  const describedBy =
    [issues.length ? errId : "", hint ? hintId : ""].filter(Boolean).join(" ") || undefined;
  return (
    <div className={cn("flex flex-col gap-1", className)}>
      <label htmlFor={input} className="text-sm text-fg-muted">
        {label}
      </label>
      {children({ input, describedBy })}
      {hint && (
        <p id={hintId} className="text-xs text-fg-subtle">
          {hint}
        </p>
      )}
      <FieldErrors id={errId} issues={issues} />
    </div>
  );
}

export function TextField({
  value,
  onChange,
  maxLength,
  multiline,
  ...base
}: BaseProps & {
  value: string;
  onChange: (v: string) => void;
  maxLength?: number;
  multiline?: boolean;
}) {
  return (
    <Field {...base}>
      {({ input, describedBy }) =>
        multiline ? (
          <textarea
            id={input}
            data-testid={base.testId}
            className={cn(inputCls, "min-h-20 py-2")}
            value={value}
            maxLength={maxLength}
            aria-invalid={(base.issues?.length ?? 0) > 0}
            aria-describedby={describedBy}
            onChange={(e) => onChange(e.target.value)}
          />
        ) : (
          <input
            id={input}
            data-testid={base.testId}
            className={inputCls}
            value={value}
            maxLength={maxLength}
            aria-invalid={(base.issues?.length ?? 0) > 0}
            aria-describedby={describedBy}
            onChange={(e) => onChange(e.target.value)}
          />
        )
      }
    </Field>
  );
}

const parseNum = (s: string): number | null => {
  const v = s.trim().replace("−", "-");
  if (v === "" || v === "-") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

/**
 * Number input that keeps the user's text while typing (e.g. "-" or "") and commits only valid
 * numbers. `nullable` lets an empty field mean "none" (min/max).
 */
export function NumberField({
  value,
  onChange,
  nullable,
  integer = true,
  ...base
}: BaseProps & {
  value: number | null | undefined;
  onChange: (v: number | null) => void;
  nullable?: boolean;
  integer?: boolean;
}) {
  const external = value === null || value === undefined ? "" : String(value);
  const [text, setText] = useState(external);
  const [prevExternal, setPrevExternal] = useState(external);
  if (external !== prevExternal) {
    setPrevExternal(external);
    if (parseNum(text) !== (value ?? null)) setText(external);
  }
  const parsed = parseNum(text);
  const localBad =
    text.trim() !== "" && (parsed === null || (integer && !Number.isInteger(parsed)));
  const missing = !nullable && text.trim() === "";
  const local: DraftIssue[] =
    localBad || missing ? [{ field: "", message: "builder.err.number" }] : [];
  return (
    <Field {...base} issues={[...local, ...(base.issues ?? [])]}>
      {({ input, describedBy }) => (
        <input
          id={input}
          data-testid={base.testId}
          className={inputCls}
          inputMode="text"
          autoComplete="off"
          value={text}
          aria-invalid={local.length + (base.issues?.length ?? 0) > 0}
          aria-describedby={describedBy}
          onChange={(e) => {
            const s = e.target.value;
            setText(s);
            const n = parseNum(s);
            if (n !== null && (!integer || Number.isInteger(n))) onChange(n);
            else if (s.trim() === "" && nullable) onChange(null);
          }}
        />
      )}
    </Field>
  );
}

export interface Option<T extends string> {
  value: T;
  label: string;
}

export function SelectField<T extends string>({
  value,
  options,
  onChange,
  ...base
}: BaseProps & { value: T; options: readonly Option<T>[]; onChange: (v: T) => void }) {
  return (
    <Field {...base}>
      {({ input, describedBy }) => (
        <span className="relative inline-flex w-full">
          <select
            id={input}
            data-testid={base.testId}
            value={value}
            aria-describedby={describedBy}
            onChange={(e) => onChange(e.target.value as T)}
            className={cn(inputCls, "appearance-none pr-9")}
          >
            {options.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
          <ChevronDown
            aria-hidden
            size={18}
            className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-fg-muted"
          />
        </span>
      )}
    </Field>
  );
}

/** A row with a label on the left and a control (Toggle) on the right. */
export function ToggleRow({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: ReactNode;
}) {
  return (
    <div className="flex min-h-14 items-center gap-3">
      <span className="flex min-w-0 flex-1 flex-col">
        <span className="text-base text-fg">{label}</span>
        {hint && <span className="text-xs text-fg-subtle">{hint}</span>}
      </span>
      {children}
    </div>
  );
}

/** Radio-group of pill buttons (type, scope, direction, display). */
export function Choice<T extends string>({
  label,
  value,
  options,
  onChange,
  testId,
  columns,
}: {
  label: string;
  value: T;
  options: readonly Option<T>[];
  onChange: (v: T) => void;
  testId?: string;
  columns?: boolean;
}) {
  const labelId = useId();
  return (
    <div className="flex flex-col gap-1">
      <span id={labelId} className="text-sm text-fg-muted">
        {label}
      </span>
      <div
        role="radiogroup"
        aria-labelledby={labelId}
        data-testid={testId}
        className={cn("flex gap-2", columns ? "flex-col" : "flex-wrap")}
      >
        {options.map((o) => (
          <button
            key={o.value}
            type="button"
            role="radio"
            aria-checked={o.value === value}
            data-testid={testId ? `${testId}-${o.value}` : undefined}
            onClick={() => onChange(o.value)}
            className={cn(
              "min-h-12 rounded-xl px-3 text-left text-base transition",
              "focus-visible:outline-2 focus-visible:outline-accent",
              o.value === value
                ? "bg-surface-3 text-fg ring-2 ring-accent"
                : "bg-surface-2 text-fg-muted hover:text-fg",
            )}
          >
            {o.label}
          </button>
        ))}
      </div>
    </div>
  );
}
