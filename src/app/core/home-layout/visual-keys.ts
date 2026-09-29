import type { Placement } from './grid-engine';

/**
 * Keyboard parity for the visual (gridstack) editor: arrow keys move the focused panel by one
 * cell, Shift+arrow resizes it by one cell. Returns the *proposed* placement (the caller still
 * validates it through the grid engine), or null for any other key.
 */
export function placementForKey(key: string, shift: boolean, current: Placement): Placement | null {
  const step = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] }[key];
  if (!step) return null;
  const [dx, dy] = step;
  return shift ? { ...current, w: current.w + dx, h: current.h + dy } : { ...current, x: current.x + dx, y: current.y + dy };
}
