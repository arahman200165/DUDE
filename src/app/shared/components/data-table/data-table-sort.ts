export type SortDirection = 'asc' | 'desc';

export interface SortState {
  readonly key: string;
  readonly direction: SortDirection;
}

/** Numeric-aware comparator: numeric strings sort by value, everything else sorts lexically. */
function compareValues(a: string, b: string): number {
  const numA = Number(a);
  const numB = Number(b);
  if (a.trim() !== '' && b.trim() !== '' && !Number.isNaN(numA) && !Number.isNaN(numB)) {
    return numA - numB;
  }
  return a.localeCompare(b);
}

/**
 * Pure row sort used by `DataTable` (DUDE_PRD.md §21 Phase 30C.2). Kept outside the
 * component so it stays unit-testable without a TestBed, per the root AGENTS.md testing posture.
 */
export function sortRows<T>(rows: readonly T[], sort: SortState | undefined, valueOf: (row: T, key: string) => string): readonly T[] {
  if (!sort) return rows;
  const factor = sort.direction === 'asc' ? 1 : -1;
  return [...rows].sort((a, b) => factor * compareValues(valueOf(a, sort.key), valueOf(b, sort.key)));
}

/** Toggles a column's sort state: unsorted → asc → desc → unsorted. */
export function nextSortState(current: SortState | undefined, key: string): SortState | undefined {
  if (!current || current.key !== key) return { key, direction: 'asc' };
  if (current.direction === 'asc') return { key, direction: 'desc' };
  return undefined;
}
