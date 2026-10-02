import { buildGradientCss, generateGradient, type GradientOptions } from "./gradient-generator-logic.js";

const baseOptions: GradientOptions = {
  type: 'linear',
  angle: 90,
  shape: 'circle',
  stops: [
    { color: '#ff0000', position: 0 },
    { color: '#0000ff', position: 100 },
  ],
};

describe('generateGradient', () => {
  it('rejects fewer than two stops', () => {
    const result = generateGradient({ ...baseOptions, stops: [{ color: '#ff0000', position: 0 }] });
    expect(result).toEqual({ ok: false, error: 'Add at least two color stops.' });
  });

  it('builds a linear-gradient CSS string', () => {
    const result = generateGradient(baseOptions);
    expect(result).toEqual({ ok: true, css: 'linear-gradient(90deg, #ff0000 0%, #0000ff 100%)' });
  });

  it('builds a radial-gradient CSS string', () => {
    const css = buildGradientCss({ ...baseOptions, type: 'radial', shape: 'ellipse' });
    expect(css).toBe('radial-gradient(ellipse at center, #ff0000 0%, #0000ff 100%)');
  });

  it('builds a conic-gradient CSS string', () => {
    const css = buildGradientCss({ ...baseOptions, type: 'conic', angle: 45 });
    expect(css).toBe('conic-gradient(from 45deg at center, #ff0000 0%, #0000ff 100%)');
  });

  it('sorts stops by position regardless of input order', () => {
    const css = buildGradientCss({
      ...baseOptions,
      stops: [
        { color: '#0000ff', position: 100 },
        { color: '#00ff00', position: 50 },
        { color: '#ff0000', position: 0 },
      ],
    });
    expect(css).toBe('linear-gradient(90deg, #ff0000 0%, #00ff00 50%, #0000ff 100%)');
  });
});
