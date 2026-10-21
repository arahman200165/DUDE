import { describe, expect, it } from 'vitest';
import { contrastView, formatRatio, previewHex } from './contrast-checker-mobile';

describe('contrast checker mobile view', () => {
  it('passes every level for black on white', () => {
    const result = contrastView('#000000', '#ffffff');
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.view.ratioText).toBe('21.00:1');
    expect(result.view.checks.every(check => check.pass)).toBe(true);
    expect(result.view.checks.map(check => check.key)).toEqual(['aa-normal', 'aa-large', 'aaa-normal', 'aaa-large', 'ui']);
  });

  it('fails the strict levels for a low-contrast pair', () => {
    const result = contrastView('#777777', '#888888');
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.view.checks.every(check => !check.pass)).toBe(true);
  });

  it('reports which side is not a color', () => {
    expect(contrastView('nope', '#fff')).toEqual({ ok: false, error: 'Could not recognize "nope" as a color.' });
  });

  it('normalises preview colors to opaque hex', () => {
    expect(previewHex('red')).toBe('#ff0000');
    expect(previewHex('rgba(0, 128, 255, 0.5)')).toBe('#0080ff');
    expect(previewHex('zzz')).toBeNull();
    expect(formatRatio(4.5)).toBe('4.50:1');
  });
});
