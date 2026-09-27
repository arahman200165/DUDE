/**
 * Shape of `offline-map.json`, written at build time by `scripts/generate-offline-map.mjs`
 * (DUDE_PRD.md §21 Phase 26 Items 4, 5, 10). Paths are relative to the app's base href. `tools`
 * and `groups` index into one deduplicated `files`/`sizes` table.
 */
export interface OfflineMap {
  readonly schemaVersion: 2;
  readonly files: readonly string[];
  readonly sizes: readonly number[];
  /**
   * `open`: what a route visit fetches (component chunk + static imports), the "opens offline" bar.
   * `extra`: workers, pipeline/workspace step chunks, and lazily imported libraries.
   */
  readonly tools: Readonly<Record<string, { readonly open: readonly number[]; readonly extra: readonly number[] }>>;
  readonly groups: Readonly<Record<string, { readonly installMode: 'prefetch' | 'lazy'; readonly files: readonly number[] }>>;
}

/** A concrete set of files plus how much of it is already cached. Used by previews and progress. */
export interface CachePlan {
  readonly files: readonly string[];
  readonly bytes: number;
  readonly missingFiles: readonly string[];
  readonly missingBytes: number;
}

export function isOfflineMap(value: unknown): value is OfflineMap {
  if (typeof value !== 'object' || value === null) return false;
  const map = value as Partial<OfflineMap>;
  return (
    map.schemaVersion === 2 &&
    Array.isArray(map.files) &&
    Array.isArray(map.sizes) &&
    map.files.length === map.sizes.length &&
    typeof map.tools === 'object' &&
    map.tools !== null &&
    typeof map.groups === 'object' &&
    map.groups !== null
  );
}

/**
 * Files a tool needs (`'open'`: to open it; `'all'`: to fully use it offline), plus every file of
 * the named asset groups (its declared runtimes).
 */
export function filesForTool(map: OfflineMap, toolId: string, groupNames: readonly string[] = [], scope: 'open' | 'all' = 'open'): string[] {
  const tool = map.tools[toolId];
  const indices = new Set<number>([...(tool?.open ?? []), ...(scope === 'all' ? (tool?.extra ?? []) : [])]);
  for (const name of groupNames) for (const index of map.groups[name]?.files ?? []) indices.add(index);
  return [...indices].map((index) => map.files[index]).filter((file): file is string => file !== undefined);
}

export function filesForGroup(map: OfflineMap, groupName: string): string[] {
  return (map.groups[groupName]?.files ?? []).map((index) => map.files[index]).filter((file): file is string => file !== undefined);
}

export function buildCachePlan(map: OfflineMap, files: Iterable<string>, cached: ReadonlySet<string>): CachePlan {
  const sizeByFile = new Map(map.files.map((file, index) => [file, map.sizes[index] ?? 0]));
  const unique = [...new Set(files)];
  const missingFiles = unique.filter((file) => !cached.has(file));
  const sum = (list: readonly string[]) => list.reduce((total, file) => total + (sizeByFile.get(file) ?? 0), 0);
  return { files: unique, bytes: sum(unique), missingFiles, missingBytes: sum(missingFiles) };
}

/**
 * Converts a Cache Storage request URL to the map's base-relative path, or `undefined` for URLs
 * outside the app's base path. `basePath` is the pathname of `document.baseURI`, e.g. `/DUDE/`.
 */
export function toRelativePath(url: string, basePath: string): string | undefined {
  let pathname: string;
  try {
    pathname = new URL(url).pathname;
  } catch {
    return undefined;
  }
  return pathname.startsWith(basePath) ? decodeURIComponent(pathname.slice(basePath.length)) : undefined;
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} kB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  return `${(bytes / 1024 / 1024 / 1024).toFixed(2)} GB`;
}
