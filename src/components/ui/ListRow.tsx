import type { ReactNode } from "react";
import { cn } from "@/lib/ui/cn";

interface Props {
  icon?: ReactNode;
  title: string;
  subtitle?: string;
  control?: ReactNode;
  onClick?: () => void;
  testId?: string;
  className?: string;
}

/** Settings-style row: icon, title + subtitle, control on the right (LifeTap settings pattern). */
export function ListRow({ icon, title, subtitle, control, onClick, testId, className }: Props) {
  const content = (
    <>
      {icon && (
        <span className="flex size-8 shrink-0 items-center justify-center text-fg-muted">
          {icon}
        </span>
      )}
      <span className="flex min-w-0 flex-1 flex-col text-left">
        <span className="text-lg leading-tight text-fg">{title}</span>
        {subtitle && <span className="text-sm leading-snug text-fg-muted">{subtitle}</span>}
      </span>
      {control && <span className="shrink-0">{control}</span>}
    </>
  );
  const cls = cn("flex min-h-16 w-full items-center gap-3 py-2", className);
  return onClick ? (
    <button
      type="button"
      onClick={onClick}
      className={cn(cls, "rounded-xl hover:bg-surface/60")}
      data-testid={testId}
    >
      {content}
    </button>
  ) : (
    <div className={cls} data-testid={testId}>
      {content}
    </div>
  );
}

export function SectionHeader({ title }: { title: string }) {
  return (
    <div className="mb-1 mt-6 flex items-center gap-4">
      <h2 className="shrink-0 text-xl text-fg-muted">{title}</h2>
      <span aria-hidden className="h-px flex-1 bg-border" />
    </div>
  );
}
