import { describe, expect, it } from 'vitest';
import {
  GRID_COLUMNS,
  GridItem,
  clampPlacement,
  compactUp,
  deriveNarrow,
  findCollisions,
  firstFit,
  moveInReadingOrder,
  normalizeLayout,
  overlaps,
  readingOrder,
  tryPlace,
  validateLayout,
} from './grid-engine';

const item = (id: string, x: number, y: number, w: number, h: number): GridItem => ({ id, x, y, w, h });

describe('clampPlacement', () => {
  it('snaps fractional values to whole cells', () => {
    expect(clampPlacement({ x: 1.4, y: 2.6, w: 3.2, h: 1.9 })).toEqual({ x: 1, y: 3, w: 3, h: 2 });
  });
  it('keeps the panel inside the 12 columns', () => {
    expect(clampPlacement({ x: 11, y: 0, w: 4, h: 2 })).toEqual({ x: 8, y: 0, w: 4, h: 2 });
    expect(clampPlacement({ x: -3, y: -1, w: 20, h: 2 })).toEqual({ x: 0, y: 0, w: GRID_COLUMNS, h: 2 });
  });
  it('enforces size limits', () => {
    const limits = { minW: 3, minH: 2, maxW: 6, maxH: 4 };
    expect(clampPlacement({ x: 0, y: 0, w: 1, h: 1 }, limits)).toEqual({ x: 0, y: 0, w: 3, h: 2 });
    expect(clampPlacement({ x: 0, y: 0, w: 12, h: 9 }, limits)).toEqual({ x: 0, y: 0, w: 6, h: 4 });
  });
  it('treats non-finite input as zero instead of throwing', () => {
    expect(clampPlacement({ x: NaN, y: Infinity, w: NaN, h: NaN })).toEqual({ x: 0, y: 0, w: 2, h: 1 });
  });
});

describe('overlaps / findCollisions', () => {
  it('treats touching edges as non-overlapping', () => {
    expect(overlaps({ x: 0, y: 0, w: 4, h: 2 }, { x: 4, y: 0, w: 4, h: 2 })).toBe(false);
    expect(overlaps({ x: 0, y: 0, w: 4, h: 2 }, { x: 0, y: 2, w: 4, h: 2 })).toBe(false);
  });
  it('detects partial overlap and ignores the moving item itself', () => {
    const items = [item('a', 0, 0, 4, 2), item('b', 4, 0, 4, 2)];
    expect(findCollisions(items, { x: 3, y: 0, w: 2, h: 1 })).toEqual(['a', 'b']);
    expect(findCollisions(items, { x: 0, y: 0, w: 4, h: 2 }, 'a')).toEqual([]);
  });
});

describe('tryPlace', () => {
  const items = [item('a', 0, 0, 6, 2), item('b', 6, 0, 6, 2)];

  it('accepts a free placement with an intelligible message', () => {
    const r = tryPlace(items, 'a', { x: 0, y: 2, w: 6, h: 2 });
    expect(r.ok).toBe(true);
    expect(r.message).toContain('Column 1, row 3');
  });
  it('rejects overlaps and names the count', () => {
    const r = tryPlace(items, 'a', { x: 3, y: 0, w: 6, h: 2 });
    expect(r).toMatchObject({ ok: false, failure: 'overlap', collisions: ['b'] });
    expect(r.message).toMatch(/Overlaps 1 other panel\./);
  });
  it('rejects too-small and too-large sizes', () => {
    expect(tryPlace(items, 'a', { x: 0, y: 0, w: 1, h: 1 }, { minW: 2, minH: 2 }).failure).toBe('too-small');
    expect(tryPlace(items, 'a', { x: 0, y: 0, w: 9, h: 1 }, { minW: 2, minH: 1, maxW: 8 }).failure).toBe('too-large');
  });
  it('rejects out-of-bounds placements without mutating input', () => {
    const r = tryPlace(items, 'a', { x: 10, y: 0, w: 4, h: 2 });
    expect(r.failure).toBe('out-of-bounds');
    expect(items[0]).toEqual(item('a', 0, 0, 6, 2));
  });
});

describe('firstFit', () => {
  it('fills gaps row-major before growing downward', () => {
    const items = [item('a', 0, 0, 6, 2), item('b', 8, 0, 4, 2)];
    expect(firstFit(items, { w: 2, h: 1 })).toEqual({ x: 6, y: 0, w: 2, h: 1 });
    expect(firstFit(items, { w: 4, h: 1 })).toEqual({ x: 0, y: 2, w: 4, h: 1 });
  });
  it('places on an empty grid at the origin', () => {
    expect(firstFit([], { w: 12, h: 3 })).toEqual({ x: 0, y: 0, w: 12, h: 3 });
  });
});

describe('readingOrder', () => {
  it('sorts top-to-bottom then left-to-right without mutating input', () => {
    const items = [item('c', 6, 2, 2, 1), item('a', 6, 0, 2, 1), item('b', 0, 0, 2, 1)];
    expect(readingOrder(items).map((i) => i.id)).toEqual(['b', 'a', 'c']);
    expect(items[0].id).toBe('c');
  });
});

describe('normalizeLayout / validateLayout', () => {
  it('repairs overlaps and out-of-range values without dropping items', () => {
    const broken = [item('a', 0, 0, 6, 2), item('b', 2, 0, 6, 2), item('c', 30, -4, 40, 0)];
    const fixed = normalizeLayout(broken);
    expect(fixed.map((i) => i.id).sort()).toEqual(['a', 'b', 'c']);
    expect(validateLayout(fixed)).toEqual([]);
  });
  it('is idempotent on an already-valid layout', () => {
    const ok = [item('a', 0, 0, 6, 2), item('b', 6, 0, 6, 2)];
    expect(normalizeLayout(ok)).toEqual(ok);
  });
  it('reports each problem when validating', () => {
    const issues = validateLayout([item('a', 0, 0, 6, 2), item('b', 3, 0, 6, 2)]);
    expect(issues.map((i) => i.failure)).toEqual(['overlap', 'overlap']);
  });
});

describe('deriveNarrow', () => {
  it('stacks every panel full width in wide reading order, keeping heights', () => {
    const wide = [item('b', 6, 0, 6, 3), item('a', 0, 0, 6, 2), item('c', 0, 3, 12, 1)];
    expect(deriveNarrow(wide)).toEqual([
      item('a', 0, 0, 12, 2),
      item('b', 0, 2, 12, 3),
      item('c', 0, 5, 12, 1),
    ]);
  });
  it('honours per-kind maximum width and never overlaps', () => {
    const wide = [item('a', 0, 0, 4, 2), item('b', 4, 0, 4, 2)];
    const limits = (id: string) => (id === 'a' ? { minW: 2, minH: 1, maxW: 6 } : { minW: 2, minH: 1 });
    const narrow = deriveNarrow(wide, limits);
    expect(narrow[0]).toMatchObject({ id: 'a', w: 6 });
    expect(validateLayout(narrow, limits)).toEqual([]);
  });
  it('preserves the same instance ids', () => {
    const wide = [item('x', 0, 0, 3, 1), item('y', 3, 0, 3, 1)];
    expect(deriveNarrow(wide).map((i) => i.id).sort()).toEqual(['x', 'y']);
  });
});

describe('moveInReadingOrder', () => {
  it('swaps positions with the neighbour', () => {
    const items = [item('a', 0, 0, 6, 2), item('b', 6, 0, 6, 2)];
    const moved = moveInReadingOrder(items, 'a', 1);
    expect(moved.find((i) => i.id === 'a')).toMatchObject({ x: 6, y: 0 });
    expect(moved.find((i) => i.id === 'b')).toMatchObject({ x: 0, y: 0 });
  });
  it('is a no-op at the ends', () => {
    const items = [item('a', 0, 0, 6, 2), item('b', 6, 0, 6, 2)];
    expect(moveInReadingOrder(items, 'a', -1)).toEqual(items);
    expect(moveInReadingOrder(items, 'b', 1)).toEqual(items);
  });
  it('refuses a swap that would create an overlap', () => {
    const items = [item('a', 0, 0, 4, 2), item('b', 4, 0, 8, 2)];
    // Swapping origins would put the 8-wide panel at x=0..8 over the 4-wide one at x=4..8.
    expect(moveInReadingOrder(items, 'a', 1)).toEqual(items);
  });
});

describe('compactUp', () => {
  it('closes the gap left by a removed panel', () => {
    const items = [item('a', 0, 0, 12, 2), item('c', 0, 5, 12, 2)];
    expect(compactUp(items)).toEqual([item('a', 0, 0, 12, 2), item('c', 0, 2, 12, 2)]);
  });
  it('keeps side-by-side panels aligned and never overlaps', () => {
    const items = [item('a', 0, 0, 6, 2), item('b', 6, 3, 6, 2), item('c', 0, 6, 12, 1)];
    const out = compactUp(items);
    expect(out.find((i) => i.id === 'b')!.y).toBe(0);
    expect(out.find((i) => i.id === 'c')!.y).toBe(2);
    expect(validateLayout(out)).toEqual([]);
  });
  it('is a no-op on an already compact layout', () => {
    const items = [item('a', 0, 0, 12, 2), item('b', 0, 2, 12, 2)];
    expect(compactUp(items)).toEqual(items);
  });
});
