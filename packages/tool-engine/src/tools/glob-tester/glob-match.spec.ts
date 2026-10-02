import { matchPaths } from "./glob-match.js";

const defaultOptions = { dot: false, nocase: false, treatBackslashAsSeparator: true };

describe('matchPaths', () => {
  it('matches a simple wildcard', () => {
    const result = matchPaths('*.ts', ['a.ts', 'b.js', 'c.ts'], defaultOptions);
    expect(result.ok).toBe(true);
    expect(result.ok && result.results).toEqual([
      { path: 'a.ts', matched: true },
      { path: 'b.js', matched: false },
      { path: 'c.ts', matched: true },
    ]);
  });

  it('matches nested directories with a globstar', () => {
    const result = matchPaths('src/**/*.spec.ts', ['src/a.spec.ts', 'src/deep/nested/b.spec.ts', 'src/b.ts'], defaultOptions);
    expect(result.ok).toBe(true);
    expect(result.ok && result.results.map((r) => r.matched)).toEqual([true, true, false]);
  });

  it('ignores dotfiles unless the dot option is set', () => {
    const withoutDot = matchPaths('*.ts', ['.hidden.ts'], defaultOptions);
    expect(withoutDot.ok && withoutDot.results[0].matched).toBe(false);

    const withDot = matchPaths('*.ts', ['.hidden.ts'], { ...defaultOptions, dot: true });
    expect(withDot.ok && withDot.results[0].matched).toBe(true);
  });

  it('is case-insensitive when nocase is set', () => {
    const result = matchPaths('*.TS', ['a.ts'], { ...defaultOptions, nocase: true });
    expect(result.ok && result.results[0].matched).toBe(true);
  });

  it('matches Windows-style backslash paths when treatBackslashAsSeparator is set', () => {
    const result = matchPaths('src/**/*.ts', ['src\\deep\\file.ts'], defaultOptions);
    expect(result.ok && result.results[0].matched).toBe(true);
  });

  it('trims and skips blank candidate lines', () => {
    const result = matchPaths('*.ts', ['  a.ts  ', '', '   '], defaultOptions);
    expect(result.ok && result.results).toEqual([{ path: 'a.ts', matched: true }]);
  });

  it('reports an error for an empty pattern', () => {
    const result = matchPaths('', ['a.ts'], defaultOptions);
    expect(result.ok).toBe(false);
  });
});
