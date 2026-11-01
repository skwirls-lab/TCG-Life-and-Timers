"use client";
import type { CSSProperties, ReactNode } from "react";
import { useHold } from "@/lib/hooks/useHold";
import { cn } from "@/lib/ui/cn";
import { useSetting } from "@/state/settingsStore";

interface Props {
  onTap: () => void;
  onHold: () => void;
  /** accessible name override; omit when the visible content is the name (WCAG 2.5.3) */
  label?: string;
  children: ReactNode;
  className?: string;
  style?: CSSProperties;
  testId?: string;
  pressed?: boolean;
  /** extra data-* attributes for tests */
  data?: Record<string, string | number | boolean | undefined>;
}

/**
 * Swallow the click that follows the pointerup of a hold: the hold replaces the content under
 * the finger (options panel) and that click must not hit the new content.
 */
function swallowNextClick() {
  const swallow = (e: Event) => {
    e.stopPropagation();
    e.preventDefault();
  };
  const release = () => {
    window.removeEventListener("pointerup", release, true);
    setTimeout(() => window.removeEventListener("click", swallow, true), 0);
  };
  window.addEventListener("click", swallow, { capture: true, once: true });
  window.addEventListener("pointerup", release, true);
}

/**
 * "Tap to increment. Hold for additional options." (§8.2). Pointer tap/hold via useHold with the
 * app hold delay; keyboard: Enter/Space = tap, Shift+Enter or the ContextMenu key = hold.
 */
export function TapHoldButton({
  onTap,
  onHold,
  label,
  children,
  className,
  style,
  testId,
  pressed,
  data,
}: Props) {
  const delay = useSetting("holdDelayMs");
  const handlers = useHold({
    delay,
    onTap,
    onHold: () => {
      swallowNextClick();
      onHold();
    },
  });
  const dataAttrs = Object.fromEntries(
    Object.entries(data ?? {})
      .filter(([, v]) => v !== undefined)
      .map(([k, v]) => [`data-${k}`, String(v)]),
  );
  return (
    <button
      type="button"
      aria-label={label}
      aria-pressed={pressed}
      data-testid={testId}
      {...dataAttrs}
      {...handlers}
      onClick={(e) => {
        // Pointer taps are handled by useHold; detail 0 = keyboard activation.
        if (e.detail === 0) onTap();
      }}
      onKeyDown={(e) => {
        if (e.key === "ContextMenu" || (e.key === "Enter" && e.shiftKey)) {
          e.preventDefault();
          onHold();
        }
      }}
      style={style}
      className={cn(
        "relative select-none touch-manipulation transition active:scale-[0.97]",
        "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent",
        className,
      )}
    >
      {children}
    </button>
  );
}
