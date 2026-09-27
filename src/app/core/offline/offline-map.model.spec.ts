import fc from 'fast-check';
import { OfflineMap, buildCachePlan, filesForGroup, filesForTool, formatBytes, isOfflineMap, toRelativePath } from './offline-map.model';

const MAP: OfflineMap = {
  schemaVersion: 2,
  files: ['chunk-a.js', 'chunk-shared.js', 'chunk-b.js', 'assets/vendor/pyodide/pyodide.asm.wasm', 'assets/vendor/pyodide/pyodide.js'],
  sizes: [100, 50, 200, 9000, 20],
  tools: { a: { open: [0], extra: [1] }, b: { open: [2, 1], extra: [] } },
  groups: {
    'tool-chunks': { installMode: 'lazy', files: [0, 1, 2] },
    pyodide: { installMode: 'lazy', files: [3, 4] },
  },
};

describe('offline-map model', () => {
  it('validates the map shape', () => {
    expect(isOfflineMap(MAP)).toBe(true);
    expect(isOfflineMap(null)).toBe(false);
    expect(isOfflineMap({ ...MAP, schemaVersion: 1 })).toBe(false);
    expect(isOfflineMap({ ...MAP, sizes: [1] })).toBe(false);
  });

  it("resolves a tool's files plus its runtime groups, deduplicated", () => {
    expect(filesForTool(MAP, 'a')).toEqual(['chunk-a.js']);
    expect(filesForTool(MAP, 'a', [], 'all').sort()).toEqual(['chunk-a.js', 'chunk-shared.js']);
    expect(filesForTool(MAP, 'a', ['pyodide'], 'all').sort()).toEqual([
      'assets/vendor/pyodide/pyodide.asm.wasm',
      'assets/vendor/pyodide/pyodide.js',
      'chunk-a.js',
      'chunk-shared.js',
    ]);
    expect(filesForTool(MAP, 'unknown')).toEqual([]);
    expect(filesForGroup(MAP, 'pyodide')).toHaveLength(2);
  });

  it('plans only the missing bytes, counting shared chunks once', () => {
    const plan = buildCachePlan(MAP, [...filesForTool(MAP, 'a', [], 'all'), ...filesForTool(MAP, 'b')], new Set(['chunk-shared.js']));
    expect(plan.files).toHaveLength(3);
    expect(plan.bytes).toBe(350);
    expect([...plan.missingFiles].sort()).toEqual(['chunk-a.js', 'chunk-b.js']);
    expect(plan.missingBytes).toBe(300);
  });

  it('never plans more missing bytes than total bytes', () => {
    fc.assert(
      fc.property(fc.subarray(MAP.files as string[]), fc.subarray(MAP.files as string[]), (wanted, cached) => {
        const plan = buildCachePlan(MAP, wanted, new Set(cached));
        return plan.missingBytes <= plan.bytes && plan.missingFiles.every((file) => !cached.includes(file));
      }),
    );
  });

  it('maps cache request URLs to base-relative paths, ignoring other scopes', () => {
    expect(toRelativePath('https://x.github.io/DUDE/chunk-a.js', '/DUDE/')).toBe('chunk-a.js');
    expect(toRelativePath('https://x.github.io/DUDE/assets/vendor/sql.js/sql-wasm-browser.wasm', '/DUDE/')).toBe(
      'assets/vendor/sql.js/sql-wasm-browser.wasm',
    );
    expect(toRelativePath('https://x.github.io/Other/chunk-a.js', '/DUDE/')).toBeUndefined();
    expect(toRelativePath('not a url', '/DUDE/')).toBeUndefined();
  });

  it('formats byte counts compactly', () => {
    expect(formatBytes(512)).toBe('512 B');
    expect(formatBytes(2048)).toBe('2.0 kB');
    expect(formatBytes(13.5 * 1024 * 1024)).toBe('13.5 MB');
  });
});
