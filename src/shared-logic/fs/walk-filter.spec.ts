import { createPathFilter, DEFAULT_WALK_OPTIONS, describeWalkOptions, sanitizeWalkOptions } from './walk-filter';
import { isIgnoredByLayers, parseGitignoreRules } from './gitignore';

describe('createPathFilter', () => {
  it('excludes default-preset names and user name/path globs, case-insensitively', () => {
    const filter = createPathFilter({ ...DEFAULT_WALK_OPTIONS, exclude: ['*.min.js', 'vendor/**'] });
    expect(filter.excluded('a/node_modules', 'node_modules')).toBe(true);
    expect(filter.excluded('a/Thumbs.DB', 'Thumbs.DB')).toBe(true);
    expect(filter.excluded('dist/app.min.js', 'app.min.js')).toBe(true);
    expect(filter.excluded('vendor/lib/x.js', 'x.js')).toBe(true);
    expect(filter.excluded('src/app.ts', 'app.ts')).toBe(false);
    expect(createPathFilter({ ...DEFAULT_WALK_OPTIONS, useDefaultExcludes: false }).excluded('node_modules', 'node_modules')).toBe(false);
  });

  it('applies include globs and size/age bounds to files only', () => {
    const filter = createPathFilter({ ...DEFAULT_WALK_OPTIONS, include: ['*.md'], minSize: 10, maxSize: 100, modifiedAfter: 1000 });
    expect(filter.fileIncluded({ path: 'docs/readme.md', size: 50, mtimeMs: 2000 })).toBe(true);
    expect(filter.fileIncluded({ path: 'docs/readme.txt', size: 50, mtimeMs: 2000 })).toBe(false);
    expect(filter.fileIncluded({ path: 'x.md', size: 5, mtimeMs: 2000 })).toBe(false);
    expect(filter.fileIncluded({ path: 'x.md', size: 50, mtimeMs: 10 })).toBe(false);
  });
});

describe('sanitizeWalkOptions', () => {
  it('fills defaults and drops malformed values from untrusted input', () => {
    const options = sanitizeWalkOptions({ include: ['*.ts', 7], maxDepth: -3, skipHidden: 'yes', minSize: 12.5 });
    expect(options.include).toEqual(['*.ts']);
    expect(options.maxDepth).toBeNull();
    expect(options.skipHidden).toBe(false);
    expect(options.useGitignore).toBe(true);
    expect(options.minSize).toBe(12.5);
    expect(sanitizeWalkOptions(null)).toEqual({ ...DEFAULT_WALK_OPTIONS });
  });

  it('summarizes what a run will skip', () => {
    expect(describeWalkOptions(DEFAULT_WALK_OPTIONS)).toBe('Skips .gitignore rules, default excludes; links reported, not followed.');
  });
});

describe('isIgnoredByLayers', () => {
  it('lets a deeper .gitignore re-include what the root ignores, and scopes rules to their directory', () => {
    const layers = [
      { base: '', rules: parseGitignoreRules('*.log\n/build\n') },
      { base: 'src', rules: parseGitignoreRules('!keep.log\ncache/\n') },
    ];
    expect(isIgnoredByLayers(layers, 'app.log', false)).toBe(true);
    expect(isIgnoredByLayers(layers, 'src/app.log', false)).toBe(true);
    expect(isIgnoredByLayers(layers, 'src/keep.log', false)).toBe(false);
    expect(isIgnoredByLayers(layers, 'build', true)).toBe(true);
    expect(isIgnoredByLayers(layers, 'src/build', true)).toBe(false);
    expect(isIgnoredByLayers(layers, 'src/cache', true)).toBe(true);
    expect(isIgnoredByLayers(layers, 'src/cache', false)).toBe(false);
    expect(isIgnoredByLayers(layers, 'other/cache', true)).toBe(false);
  });
});
