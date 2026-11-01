/**
 * Layout variant ids offered per player count (LAY-002/LAY-003 thumbnails in setup + settings).
 *
 * Interim static list owned by the SHELL lane: `default` for every count, plus `rows` for 4
 * players. The layout engine (`src/engine/layout.ts`, BOARD lane) is the source of truth; the
 * orchestrator reconciles this list with it.
 */
export interface LayoutVariant {
  id: string;
  /** Thumbnail cells as [col, row, colSpan, rowSpan] on a small grid. */
  cells: [number, number, number, number][];
  cols: number;
  rows: number;
}

function twoColumns(players: number): LayoutVariant {
  if (players <= 1) return { id: "default", cells: [[1, 1, 1, 1]], cols: 1, rows: 1 };
  if (players === 2)
    return {
      id: "default",
      cells: [
        [1, 1, 1, 1],
        [1, 2, 1, 1],
      ],
      cols: 1,
      rows: 2,
    };
  const perCol = Math.ceil(players / 2);
  const odd = players % 2 === 1;
  const cells: LayoutVariant["cells"] = [];
  // Odd counts: one seat spans the top across both columns.
  let rows = perCol;
  let startRow = 1;
  if (odd) {
    cells.push([1, 1, 2, 1]);
    startRow = 2;
    rows = (players - 1) / 2 + 1;
  }
  const remaining = odd ? players - 1 : players;
  for (let i = 0; i < remaining / 2; i++) {
    cells.push([1, startRow + i, 1, 1]);
    cells.push([2, startRow + i, 1, 1]);
  }
  return { id: "default", cells, cols: 2, rows };
}

const ROWS_4: LayoutVariant = {
  id: "rows",
  cells: [
    [1, 1, 1, 1],
    [1, 2, 1, 1],
    [1, 3, 1, 1],
    [1, 4, 1, 1],
  ],
  cols: 1,
  rows: 4,
};

/** Variants for a player count (always at least `default`). */
export function layoutVariantsFor(players: number): LayoutVariant[] {
  const base = twoColumns(players);
  return players === 4 ? [base, ROWS_4] : [base];
}

/** A valid variant id for the count (falls back to `default`). */
export function normalizeLayoutId(players: number, id: string | undefined): string {
  return layoutVariantsFor(players).some((v) => v.id === id) ? id! : "default";
}
