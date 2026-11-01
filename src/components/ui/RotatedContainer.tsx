import type { CSSProperties, ReactNode } from "react";
import { cn } from "@/lib/ui/cn";
import type { Rotation } from "@/lib/ui/rotation";

interface Props {
  rotation: Rotation;
  className?: string;
  innerClassName?: string;
  style?: CSSProperties;
  children: ReactNode;
  testId?: string;
}

/**
 * Fills its parent box and renders children rotated to face a player sitting at that edge.
 * Pure CSS (container query units), so no measurement or layout effects are needed.
 */
export function RotatedContainer({
  rotation,
  className,
  innerClassName,
  style,
  children,
  testId,
}: Props) {
  return (
    <div
      className={cn("rot-outer", className)}
      style={style}
      data-testid={testId}
      data-rotation={rotation}
    >
      <div className={cn("rot-inner", `rot-${rotation}`, innerClassName)}>{children}</div>
    </div>
  );
}
