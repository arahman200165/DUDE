import { COLLAB_COLOR_SLOTS, collabCursorColors, normalizeColorSlot } from "./collab-colors.js";

describe('collab-colors', () => {
  it('maps the eight slots to the eight category palette tokens', () => {
    const colors = Array.from({ length: COLLAB_COLOR_SLOTS }, (_, slot) => collabCursorColors(slot).color);
    expect(new Set(colors).size).toBe(8);
    for (const color of colors) expect(color).toMatch(/^var\(--dude-cat-[a-z-]+\)$/);
  });

  it('derives the selection fill from the same token, never a literal color', () => {
    const { color, colorLight } = collabCursorColors(3);
    expect(colorLight).toContain(color);
    expect(`${color}${colorLight}`).not.toMatch(/#[0-9a-f]{3,8}/i);
  });

  it('wraps out-of-range slots and rejects anything that is not an integer', () => {
    expect(normalizeColorSlot(9)).toBe(1);
    expect(normalizeColorSlot(-1)).toBe(7);
    expect(normalizeColorSlot('red;background:url(x)')).toBe(0);
    expect(normalizeColorSlot(1.5)).toBe(0);
    expect(normalizeColorSlot(undefined)).toBe(0);
  });
});
