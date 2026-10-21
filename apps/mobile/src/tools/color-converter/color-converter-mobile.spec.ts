import { describe, expect, it } from 'vitest';
import { alphaOf, colorView } from './color-converter-mobile';

describe('color converter mobile view', () => {
  it('lists every format for an opaque color without an alpha row', () => {
    const result = colorView('#ff0000');
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.view.swatch).toBe('#ff0000');
    expect(result.view.alpha).toBeNull();
    const byKey = Object.fromEntries(result.view.rows.map(row => [row.key, row.value]));
    expect(byKey.rgb).toBe('rgb(255, 0, 0)');
    expect(byKey.hsl).toBe('hsl(0, 100%, 50%)');
    expect(byKey.alpha).toBeUndefined();
  });

  it('adds an alpha row and an opaque swatch for translucent input', () => {
    const result = colorView('rgba(0, 128, 255, 0.5)');
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.view.alpha).toBe(0.5);
    expect(result.view.swatch).toBe('#0080ff');
    expect(result.view.rows.find(row => row.key === 'alpha')?.value).toBe('0.5');
  });

  it('reports engine errors', () => {
    expect(colorView('notacolor')).toEqual({ ok: false, error: 'Could not recognize this as a color.' });
    expect(colorView('  ')).toEqual({ ok: false, error: 'Enter a color to convert.' });
  });

  it('parses alpha only when below one', () => {
    expect(alphaOf('rgb(1, 2, 3)')).toBeNull();
    expect(alphaOf('rgba(1, 2, 3, 1)')).toBeNull();
    expect(alphaOf('rgba(1, 2, 3, 0.25)')).toBe(0.25);
  });
});
