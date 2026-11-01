/**
 * Layout variant ids offered per player count (LAY-002/LAY-003 thumbnails in setup + settings).
 * Derived from the layout engine (`src/engine/layout.ts`), which is the single source of truth
 * (D-038). Thumbnails are rendered from the engine's seat rects in a portrait phone frame.
 */
import { getLayout, layoutVariants, type Rect } from "@/engine/layout";
import type { Rotation } from "@/lib/ui/rotation";

export interface LayoutVariant {
  id: string;
  /** i18n key for the variant name (board.layout.<id>) */
  labelKey: string;
  seats: { rect: Rect; rotation: Rotation }[];
  toolbar: Rect;
}

// A real phone viewport: band heights and the toolbar are sized in px by the engine.
const THUMB_VIEWPORT = { w: 360, h: 740 };

/** Variants for a player count, in engine order (the first is the default). */
export function layoutVariantsFor(players: number): LayoutVariant[] {
  return layoutVariants(players).map((v) => {
    const l = getLayout({ players, variantId: v.id, viewport: THUMB_VIEWPORT });
    return {
      id: v.id,
      labelKey: v.label,
      seats: l.seats.map((s) => ({ rect: s.rect, rotation: s.rotation })),
      toolbar: l.toolbar.rect,
    };
  });
}

/** A valid variant id for the count (falls back to the engine's first variant). */
export function normalizeLayoutId(players: number, id: string | undefined): string {
  const variants = layoutVariants(players);
  return variants.some((v) => v.id === id) ? id! : variants[0]!.id;
}
