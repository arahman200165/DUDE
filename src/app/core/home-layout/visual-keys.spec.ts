import { describe, expect, it } from 'vitest';
import { placementForKey } from './visual-keys';

const p = { x: 2, y: 3, w: 4, h: 2 };

describe('placementForKey', () => {
  it('moves one cell per arrow key', () => {
    expect(placementForKey('ArrowLeft', false, p)).toEqual({ x: 1, y: 3, w: 4, h: 2 });
    expect(placementForKey('ArrowRight', false, p)).toEqual({ x: 3, y: 3, w: 4, h: 2 });
    expect(placementForKey('ArrowUp', false, p)).toEqual({ x: 2, y: 2, w: 4, h: 2 });
    expect(placementForKey('ArrowDown', false, p)).toEqual({ x: 2, y: 4, w: 4, h: 2 });
  });
  it('resizes one cell per Shift+arrow', () => {
    expect(placementForKey('ArrowRight', true, p)).toEqual({ x: 2, y: 3, w: 5, h: 2 });
    expect(placementForKey('ArrowUp', true, p)).toEqual({ x: 2, y: 3, w: 4, h: 1 });
  });
  it('ignores other keys', () => {
    expect(placementForKey('Enter', false, p)).toBeNull();
    expect(placementForKey('a', true, p)).toBeNull();
  });
});
