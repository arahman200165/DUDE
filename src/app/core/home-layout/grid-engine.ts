/**
 * Pure snapping-grid engine for the user-designed Home (Phase 30I).
 *
 * No Angular, no DOM, no knowledge of any panel kind: callers pass size limits in.
 * Placements are integer cells on a fixed 12-column grid with unbounded rows.
 * This module is the source of truth for validity; any pointer UI (gridstack)
 * only proposes placements and must route them through `tryPlace`.
 */

export const GRID_COLUMNS = 12;

export interface Placement {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface GridItem extends Placement {
  id: string;
}

export interface SizeLimits {
  minW: number;
  minH: number;
  maxW?: number;
  maxH?: number;
}

export const DEFAULT_SIZE_LIMITS: SizeLimits = { minW: 2, minH: 1 };

export type LimitsOf = (id: string) => SizeLimits;

export type PlacementFailure = 'overlap' | 'out-of-bounds' | 'too-small' | 'too-large';

export interface PlacementResult {
  ok: boolean;
  /** Snapped/clamped placement the engine would store (also returned on failure, for previews). */
  placement: Placement;
  /** Ids of items the candidate overlaps. */
  collisions: string[];
  /** Human-readable, intelligible outcome for the editor's result preview. */
  message: string;
  failure?: PlacementFailure;
}

const toInt = (n: number): number => (Number.isFinite(n) ? Math.round(n) : 0);

/** Snap to integer cells and clamp into the grid and the kind's size limits. */
export function clampPlacement(p: Placement, limits: SizeLimits = DEFAULT_SIZE_LIMITS, cols = GRID_COLUMNS): Placement {
  const maxW = Math.min(limits.maxW ?? cols, cols);
  const minW = Math.min(Math.max(limits.minW, 1), maxW);
  const maxH = limits.maxH ?? Number.MAX_SAFE_INTEGER;
  const minH = Math.min(Math.max(limits.minH, 1), maxH);
  const w = Math.min(Math.max(toInt(p.w), minW), maxW);
  const h = Math.min(Math.max(toInt(p.h), minH), maxH);
  const x = Math.min(Math.max(toInt(p.x), 0), cols - w);
  const y = Math.max(toInt(p.y), 0);
  return { x, y, w, h };
}

export function overlaps(a: Placement, b: Placement): boolean {
  return a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
}

export function findCollisions(items: readonly GridItem[], candidate: Placement, ignoreId?: string): string[] {
  return items.filter((i) => i.id !== ignoreId && overlaps(i, candidate)).map((i) => i.id);
}

/**
 * Validate a proposed placement for `id` against the others. Snaps first, then
 * rejects (never silently moves) overlaps, so the editor can show why.
 */
export function tryPlace(
  items: readonly GridItem[],
  id: string,
  candidate: Placement,
  limits: SizeLimits = DEFAULT_SIZE_LIMITS,
  cols = GRID_COLUMNS,
): PlacementResult {
  const raw = { x: toInt(candidate.x), y: toInt(candidate.y), w: toInt(candidate.w), h: toInt(candidate.h) };
  const placement = clampPlacement(raw, limits, cols);

  if (raw.w < limits.minW || raw.h < limits.minH) {
    return {
      ok: false,
      placement,
      collisions: [],
      failure: 'too-small',
      message: `Too small: minimum is ${limits.minW}×${limits.minH} cells.`,
    };
  }
  if ((limits.maxW !== undefined && raw.w > limits.maxW) || (limits.maxH !== undefined && raw.h > limits.maxH)) {
    return {
      ok: false,
      placement,
      collisions: [],
      failure: 'too-large',
      message: `Too large: maximum is ${limits.maxW ?? cols}×${limits.maxH ?? '∞'} cells.`,
    };
  }
  if (raw.x < 0 || raw.y < 0 || raw.x + raw.w > cols) {
    return {
      ok: false,
      placement,
      collisions: [],
      failure: 'out-of-bounds',
      message: `Outside the ${cols}-column grid.`,
    };
  }
  const collisions = findCollisions(items, placement, id);
  if (collisions.length > 0) {
    return {
      ok: false,
      placement,
      collisions,
      failure: 'overlap',
      message: `Overlaps ${collisions.length} other panel${collisions.length === 1 ? '' : 's'}.`,
    };
  }
  return {
    ok: true,
    placement,
    collisions: [],
    message: `Column ${placement.x + 1}, row ${placement.y + 1}, ${placement.w}×${placement.h} cells.`,
  };
}

/** First row-major position where a `w`×`h` block fits without overlap. */
export function firstFit(items: readonly GridItem[], size: { w: number; h: number }, cols = GRID_COLUMNS, minY = 0): Placement {
  const w = Math.min(Math.max(toInt(size.w), 1), cols);
  const h = Math.max(toInt(size.h), 1);
  const bottom = Math.max(items.reduce((m, i) => Math.max(m, i.y + i.h), 0), minY);
  for (let y = Math.max(minY, 0); y <= bottom; y++) {
    for (let x = 0; x + w <= cols; x++) {
      const candidate = { x, y, w, h };
      if (findCollisions(items, candidate).length === 0) return candidate;
    }
  }
  return { x: 0, y: bottom, w, h };
}

/** Reading order: top-to-bottom, then left-to-right, then id for stability. */
export function readingOrder<T extends Placement & { id: string }>(items: readonly T[]): T[] {
  return [...items].sort((a, b) => a.y - b.y || a.x - b.x || a.id.localeCompare(b.id));
}

/**
 * Repair an arbitrary (possibly restored/imported) list into a valid layout:
 * clamps every item, then re-places any that overlap an earlier item via `firstFit`.
 * Never drops items, so a bad record can't blank Home.
 */
export function normalizeLayout(items: readonly GridItem[], limitsOf: LimitsOf = () => DEFAULT_SIZE_LIMITS, cols = GRID_COLUMNS): GridItem[] {
  const placed: GridItem[] = [];
  for (const item of readingOrder(items)) {
    const clamped = clampPlacement(item, limitsOf(item.id), cols);
    const fits = findCollisions(placed, clamped).length === 0;
    placed.push({ id: item.id, ...(fits ? clamped : firstFit(placed, clamped, cols)) });
  }
  return placed;
}

export interface LayoutIssue {
  id: string;
  failure: PlacementFailure;
  message: string;
}

/** Report every problem in a layout without changing it (used before Save). */
export function validateLayout(items: readonly GridItem[], limitsOf: LimitsOf = () => DEFAULT_SIZE_LIMITS, cols = GRID_COLUMNS): LayoutIssue[] {
  const issues: LayoutIssue[] = [];
  for (const item of items) {
    const result = tryPlace(items, item.id, item, limitsOf(item.id), cols);
    if (!result.ok && result.failure) issues.push({ id: item.id, failure: result.failure, message: result.message });
  }
  return issues;
}

/**
 * Derive an initial narrow arrangement from a wide layout: one panel per row in
 * wide reading order, full width unless the kind caps its width. Panel ids and
 * heights are preserved so the same instances appear in both layouts.
 */
export function deriveNarrow(wide: readonly GridItem[], limitsOf: LimitsOf = () => DEFAULT_SIZE_LIMITS, cols = GRID_COLUMNS): GridItem[] {
  let y = 0;
  return readingOrder(wide).map((item) => {
    const limits = limitsOf(item.id);
    const w = Math.min(limits.maxW ?? cols, cols);
    const h = Math.min(Math.max(item.h, limits.minH), limits.maxH ?? Number.MAX_SAFE_INTEGER);
    const placed = { id: item.id, x: 0, y, w, h };
    y += h;
    return placed;
  });
}

/**
 * Apply a list-form move: shift an item one step in reading order by swapping
 * positions with its neighbour when sizes allow, else returning the input unchanged.
 */
export function moveInReadingOrder(items: readonly GridItem[], id: string, direction: -1 | 1, limitsOf: LimitsOf = () => DEFAULT_SIZE_LIMITS, cols = GRID_COLUMNS): GridItem[] {
  const ordered = readingOrder(items);
  const index = ordered.findIndex((i) => i.id === id);
  const other = index + direction;
  if (index < 0 || other < 0 || other >= ordered.length) return [...items];
  const a = ordered[index];
  const b = ordered[other];
  const swapped = items.map((i) => {
    if (i.id === a.id) return { ...i, x: b.x, y: b.y };
    if (i.id === b.id) return { ...i, x: a.x, y: a.y };
    return i;
  });
  return normalizeLayout(swapped, limitsOf, cols).length === items.length && validateLayout(swapped, limitsOf, cols).length === 0
    ? swapped
    : [...items];
}

/**
 * Close vertical gaps: each item, in reading order, rises as far as it can without overlapping an
 * already-settled item. Used at render time after unavailable/hidden/empty panels are removed, so
 * Home never shows blank cells where a panel used to be. Horizontal position is untouched.
 */
export function compactUp(items: readonly GridItem[]): GridItem[] {
  const settled: GridItem[] = [];
  for (const item of readingOrder(items)) {
    let y = item.y;
    while (y > 0 && findCollisions(settled, { x: item.x, y: y - 1, w: item.w, h: item.h }).length === 0) y--;
    settled.push({ ...item, y });
  }
  return settled;
}
