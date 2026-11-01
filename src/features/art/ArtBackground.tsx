"use client";
/**
 * Seat background renderer (LAY-007, SET-002, ART-003/004/009/022). Drop-in for the board tile:
 *
 *   <ArtBackground art={seat.art} fallbackColor={seat.color} className="absolute inset-0" />
 *
 * Props
 * - `art`           the seat's ArtRef (any kind; undefined = default background)
 * - `fallbackColor` the seat color: used for default/solid art and while an image loads or when it
 *                   can't be resolved (e.g. an upload that is not on this device)
 * - `className`     positioning/sizing classes for the outer box (it clips its art layer; it
 *                   becomes `relative` unless the classes already position it)
 * - `style`         extra outer styles; `children` render above the art (e.g. a scrim)
 * - `testId`        optional data-testid; the outer box also exposes `data-art-kind` and
 *                   `data-art-src` ("remote" | "copy" | "blob" | "none") for tests
 *
 * Gradients and solids use `artToCss`. Images (Scryfall / upload) render in an inner layer with
 * cover × zoom around the focal point (`focalLayerStyle`), using only background + transform.
 */
import type { CSSProperties, ReactNode } from "react";
import type { ArtRef } from "@/engine";
import { artToCss } from "@/features/backgrounds/gradients";
import { focalLayerStyle } from "@/lib/art/focal";
import { isImageArt } from "@/lib/art/resolve";
import { cn } from "@/lib/ui/cn";
import { useArtUrl } from "./useArtUrl";

export interface ArtBackgroundProps {
  art: ArtRef | undefined;
  fallbackColor: string;
  className?: string;
  style?: CSSProperties;
  children?: ReactNode;
  testId?: string;
}

const POSITIONED = /(^|\s)(absolute|fixed|sticky|relative)(\s|$)/;

export function ArtBackground({
  art,
  fallbackColor,
  className,
  style,
  children,
  testId,
}: ArtBackgroundProps) {
  const image = isImageArt(art);
  const { url, source } = useArtUrl(image ? art : undefined);
  const base = image ? artToCss(undefined, fallbackColor) : artToCss(art, fallbackColor);
  return (
    <div
      className={cn(!POSITIONED.test(className ?? "") && "relative", "overflow-hidden", className)}
      style={{ ...base, ...style }}
      data-testid={testId}
      data-art-kind={art?.kind ?? "default"}
      data-art-src={image ? source : "none"}
    >
      {image && url && (
        <div
          aria-hidden
          data-art-layer=""
          className="pointer-events-none absolute inset-0"
          style={{
            backgroundImage: `url("${url.replace(/"/g, "%22")}")`,
            ...focalLayerStyle(art.focal),
          }}
        />
      )}
      {children}
    </div>
  );
}
