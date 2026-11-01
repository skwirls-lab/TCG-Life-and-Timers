import type { CSSProperties, HTMLAttributes, ReactNode } from "react";
import { cn } from "@/lib/ui/cn";
import type { Rotation } from "@/lib/ui/rotation";

interface Props extends Omit<HTMLAttributes<HTMLDivElement>, "className" | "style" | "children"> {
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
  ...rest
}: Props) {
  return (
    <div
      {...rest}
      className={cn("rot-outer", className)}
      style={style}
      data-testid={testId}
      data-rotation={rotation}
    >
      <div className={cn("rot-inner", `rot-${rotation}`, innerClassName)}>{children}</div>
    </div>
  );
}
