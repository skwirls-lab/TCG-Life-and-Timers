"use client";
/** Small shared building blocks for the Past Games screens. */
import Link from "next/link";
import { ChevronLeft, Lock } from "lucide-react";
import type { ReactNode } from "react";
import { LockBadge } from "@/components/ui";
import { t } from "@/lib/i18n";
import { cn } from "@/lib/ui/cn";
import type { Bucket } from "@/lib/stats";
import { pctText } from "./format";

export function Section({
  title,
  children,
  testId,
  action,
}: {
  title: string;
  children: ReactNode;
  testId?: string;
  action?: ReactNode;
}) {
  return (
    <section className="mt-5" data-testid={testId}>
      <div className="mb-2 flex items-center justify-between gap-2">
        <h3 className="text-lg text-fg-muted">{title}</h3>
        {action}
      </div>
      {children}
    </section>
  );
}

export function Card({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn("rounded-2xl bg-surface p-4", className)}>{children}</div>;
}

export function BackButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="mt-3 inline-flex min-h-12 items-center gap-1 rounded-xl pr-3 text-accent"
      data-testid="past-back"
    >
      <ChevronLeft size={22} aria-hidden />
      {t("historyPast.back")}
    </button>
  );
}

export function UnlockLink({ testId }: { testId?: string }) {
  return (
    <Link
      href="/pro"
      className="inline-flex min-h-12 items-center gap-2 rounded-xl bg-accent px-4 font-medium text-accent-fg"
      data-testid={testId}
    >
      <Lock size={16} aria-hidden />
      {t("historyPast.unlock")}
    </Link>
  );
}

/**
 * Locked content (§17.2): a blurred, non-interactive preview with a Pro badge and an unlock link.
 * The preview is hidden from assistive tech (`aria-hidden` + `inert`).
 */
export function Locked({
  allowed,
  children,
  testId,
}: {
  allowed: boolean;
  children: ReactNode;
  testId?: string;
}) {
  if (allowed) return <>{children}</>;
  return (
    <div
      className="relative mt-2 overflow-hidden rounded-2xl"
      data-testid={testId}
      data-locked="true"
    >
      <div aria-hidden inert className="pointer-events-none select-none blur-sm saturate-50">
        {children}
      </div>
      <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-bg/60 p-4 text-center">
        <LockBadge />
        <p className="max-w-xs text-sm text-fg">{t("historyPast.lockedHint")}</p>
        <UnlockLink testId={testId ? `${testId}-unlock` : undefined} />
      </div>
    </div>
  );
}

/** One W/L row with a win-% bar. */
export function BucketRow({ b, label }: { b: Bucket; label?: string }) {
  const pct = b.winPct ?? 0;
  return (
    <li className="flex min-h-12 flex-col justify-center gap-1 py-1" data-testid="bucket-row">
      <div className="flex items-center gap-2">
        <span className="min-w-0 flex-1 truncate">{label ?? b.label}</span>
        <span className="tabular text-fg-muted">
          {t("historyPast.players.wl", { wins: b.wins, losses: b.losses })}
        </span>
        <span className="w-12 text-right font-semibold tabular" data-testid="bucket-pct">
          {pctText(b.winPct)}
        </span>
      </div>
      <Bar value={pct} />
    </li>
  );
}

export function Bar({ value, color }: { value: number; color?: string }) {
  return (
    <span aria-hidden className="block h-1.5 w-full overflow-hidden rounded-full bg-surface-3">
      <span
        className="block h-full rounded-full bg-accent"
        style={{
          width: `${Math.round(Math.max(0, Math.min(1, value)) * 100)}%`,
          background: color,
        }}
      />
    </span>
  );
}

export function Empty({ text, testId }: { text: string; testId?: string }) {
  return (
    <p className="py-6 text-center text-fg-muted" data-testid={testId}>
      {text}
    </p>
  );
}
