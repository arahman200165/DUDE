import { testGitignorePaths } from "./gitignore-tester-logic.js";

describe('testGitignorePaths', () => {
  it('matches an unanchored pattern at any depth', () => {
    const result = testGitignorePaths('*.log', ['debug.log', 'src/debug.log', 'src/index.ts']);
    expect(result).toEqual([
      { path: 'debug.log', ignored: true, matchedRule: '*.log' },
      { path: 'src/debug.log', ignored: true, matchedRule: '*.log' },
      { path: 'src/index.ts', ignored: false },
    ]);
  });

  it('anchors a pattern containing a slash to the root', () => {
    const result = testGitignorePaths('/build', ['build', 'src/build']);
    expect(result[0]).toEqual({ path: 'build', ignored: true, matchedRule: '/build' });
    expect(result[1]).toEqual({ path: 'src/build', ignored: false });
  });

  it('ignores everything nested under a matched directory', () => {
    const result = testGitignorePaths('node_modules/', ['node_modules/', 'node_modules/left-pad/index.js', 'src/index.ts']);
    expect(result[0].ignored).toBe(true);
    expect(result[1].ignored).toBe(true);
    expect(result[2].ignored).toBe(false);
  });

  it('does not treat a directory-only pattern as matching a same-named file', () => {
    const result = testGitignorePaths('build/', ['build']);
    expect(result[0].ignored).toBe(false);
  });

  it('a later negation un-ignores an earlier match', () => {
    const result = testGitignorePaths('*.log\n!important.log', ['debug.log', 'important.log']);
    expect(result[0].ignored).toBe(true);
    expect(result[1].ignored).toBe(false);
  });

  it('ignores comment and blank lines', () => {
    const result = testGitignorePaths('# comment\n\n*.log', ['debug.log']);
    expect(result[0].ignored).toBe(true);
  });

  it('returns not-ignored for a path matching no rule', () => {
    expect(testGitignorePaths('*.log', ['index.ts'])).toEqual([{ path: 'index.ts', ignored: false }]);
  });
});
