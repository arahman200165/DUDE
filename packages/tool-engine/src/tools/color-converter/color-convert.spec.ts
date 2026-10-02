import { oklabToOklch, parseColor, rgbToOklab } from "./color-convert.js";

describe('parseColor', () => {
  it('parses a hex color and returns every format', () => {
    const result = parseColor('#ff0000');
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.formats).toEqual({
      hex: '#ff0000',
      rgb: 'rgb(255, 0, 0)',
      hsl: 'hsl(0, 100%, 50%)',
      hsv: 'hsv(0, 100%, 100%)',
      cmyk: 'device-cmyk(0% 100% 100% 0%)',
      lab: result.formats.lab,
      lch: result.formats.lch,
      hwb: result.formats.hwb,
      oklab: result.formats.oklab,
      oklch: result.formats.oklch,
      name: 'red',
    });

    // Pure red's known OKLCh is ~ L=0.628 C=0.258 H=29.2deg (Ottosson reference values).
    expect(result.formats.oklch).toMatch(/^oklch\(62\.[0-9]%/);
  });

  it('parses an rgb() string', () => {
    const result = parseColor('rgb(0, 128, 255)');
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.formats.hex).toBe('#0080ff');
  });

  it('parses an hsl() string', () => {
    const result = parseColor('hsl(0, 100%, 50%)');
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.formats.hex).toBe('#ff0000');
  });

  it('parses rgba with alpha and includes it in the rgb string', () => {
    const result = parseColor('rgba(0, 128, 255, 0.5)');
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.formats.rgb).toBe('rgba(0, 128, 255, 0.5)');
  });

  it('parses a named CSS color', () => {
    const result = parseColor('rebeccapurple');
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.formats.hex).toBe('#663399');
    expect(result.formats.name).toBe('rebeccapurple');
  });

  it('finds the closest named color for a color with no exact name', () => {
    const result = parseColor('#ff0001');
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.formats.name).toBe('red');
  });

  it('is tolerant of surrounding whitespace', () => {
    const result = parseColor('  #ff0000  ');
    expect(result.ok).toBe(true);
  });

  it('rejects an empty input', () => {
    expect(parseColor('')).toEqual({ ok: false, error: 'Enter a color to convert.' });
  });

  it('rejects unrecognized input', () => {
    expect(parseColor('not-a-color')).toEqual({
      ok: false,
      error: 'Could not recognize this as a color.',
    });
  });
});

describe('rgbToOklab / oklabToOklch', () => {
  it('maps pure white to L≈1, a≈0, b≈0', () => {
    const oklab = rgbToOklab(255, 255, 255);
    expect(oklab.l).toBeCloseTo(1, 2);
    expect(oklab.a).toBeCloseTo(0, 2);
    expect(oklab.b).toBeCloseTo(0, 2);
  });

  it('maps pure black to L≈0, a≈0, b≈0', () => {
    const oklab = rgbToOklab(0, 0, 0);
    expect(oklab.l).toBeCloseTo(0, 2);
    expect(oklab.a).toBeCloseTo(0, 2);
    expect(oklab.b).toBeCloseTo(0, 2);
  });

  it('maps pure red to the known Ottosson reference OKLab value', () => {
    const oklab = rgbToOklab(255, 0, 0);
    expect(oklab.l).toBeCloseTo(0.6279, 3);
    expect(oklab.a).toBeCloseTo(0.2249, 3);
    expect(oklab.b).toBeCloseTo(0.1258, 3);
  });

  it('derives OKLCh chroma/hue from OKLab a/b', () => {
    const oklch = oklabToOklch({ l: 0.5, a: 0.1, b: 0 });
    expect(oklch.l).toBe(0.5);
    expect(oklch.c).toBeCloseTo(0.1, 5);
    expect(oklch.h).toBe(0);
  });
});
