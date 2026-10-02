import { ASCII_ART_FONTS } from "./ascii-art-fonts.js";
import { renderAsciiArt } from "./ascii-art-render.js";

describe('ASCII_ART_FONTS', () => {
  it('lists a curated set of fonts, including Standard', () => {
    expect(ASCII_ART_FONTS.length).toBeGreaterThan(5);
    expect(ASCII_ART_FONTS).toContain('Standard');
  });
});

describe('renderAsciiArt', () => {
  it('renders text as multi-line ASCII art', () => {
    const result = renderAsciiArt('Hi', 'Standard');
    expect(result.split('\n').length).toBeGreaterThan(1);
  });

  it('renders differently for different fonts', () => {
    const standard = renderAsciiArt('Hi', 'Standard');
    const slant = renderAsciiArt('Hi', 'Slant');
    expect(standard).not.toBe(slant);
  });

  it('returns an empty string for blank input', () => {
    expect(renderAsciiArt('', 'Standard')).toBe('');
    expect(renderAsciiArt('   ', 'Standard')).toBe('');
  });

  it('returns a friendly message for an unknown font instead of throwing', () => {
    expect(() => renderAsciiArt('Hi', 'Not A Real Font')).not.toThrow();
    expect(renderAsciiArt('Hi', 'Not A Real Font')).toContain('Could not render');
  });
});
