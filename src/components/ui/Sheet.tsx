"use client";
import { X } from "lucide-react";
import { useEffect, useRef, type ReactNode } from "react";
import { cn } from "@/lib/ui/cn";
import type { Rotation } from "@/lib/ui/rotation";
import { useBackClose } from "@/lib/hooks/useBackClose";
import { t } from "@/lib/i18n";
import { IconButton } from "./Button";

interface Props {
  open: boolean;
  onClose: () => void;
  title?: string;
  /** rotate the whole sheet to face a seat's player (LifeTap rotated seat menu) */
  rotation?: Rotation;
  children: ReactNode;
  testId?: string;
  className?: string;
}

/**
 * Modal panel centered over a dimmed board. When `rotation` is 90/180/270 the panel turns to face
 * that seat's player. Closes on X, backdrop tap, Escape and Android Back (SEAT-005).
 */
export function Sheet({ open, onClose, title, rotation = 0, children, testId, className }: Props) {
  useBackClose(open, onClose);
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    panelRef.current?.focus();
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;
  const sideways = rotation === 90 || rotation === 270;
  return (
    <div className="fixed inset-0 z-50" data-testid={testId}>
      <button
        type="button"
        aria-label={t("common.close")}
        className="absolute inset-0 bg-black/70"
        onClick={onClose}
      />
      <div className="pointer-events-none absolute inset-0 flex items-center justify-center p-3">
        <div
          ref={panelRef}
          role="dialog"
          aria-modal="true"
          aria-label={title}
          tabIndex={-1}
          style={{
            transform: `rotate(${rotation}deg)`,
            width: sideways ? "min(92dvh, 40rem)" : "min(100%, 40rem)",
            maxHeight: sideways ? "92vw" : "92dvh",
          }}
          className={cn(
            "pointer-events-auto flex shrink-0 flex-col overflow-hidden rounded-[2rem] bg-surface text-fg shadow-2xl outline-none",
            className,
          )}
        >
          <div className="flex items-center gap-2 px-4 pt-3">
            {title && <h2 className="flex-1 truncate text-lg font-semibold">{title}</h2>}
            {!title && <span className="flex-1" />}
            <IconButton
              label={t("common.close")}
              onClick={onClose}
              data-testid={testId ? `${testId}-close` : undefined}
            >
              <X size={26} />
            </IconButton>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-4">{children}</div>
        </div>
      </div>
    </div>
  );
}
