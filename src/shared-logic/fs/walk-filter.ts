import picomatch from 'picomatch';
import type { WalkEntry, WalkOptions } from './fs-types';

/**
 * Pure include/exclude/size/age filtering for the native tree walker (`electron/fs-walk.ts`),
 * shared with the renderer so tools can describe exactly what a run will skip before it starts.
 * `.gitignore` layering lives in `gitignore.ts`; Windows attribute checks happen in the walker.
 */

/** Editable default preset: VCS metadata, dependency/build caches, and Windows system folders. */
export const DEFAULT_EXCLUDES: readonly string[] = [
  '.git',
  '.hg',
  '.svn',
  'node_modules',
  '.angular',
  '.cache',
  '__pycache__',
  '.venv',
  '$RECYCLE.BIN',
  'System Volume Information',
  'Thumbs.db',
  'desktop.ini',
];

export const DEFAULT_WALK_OPTIONS: WalkOptions = {
  useGitignore: true,
  useDefaultExcludes: true,
  include: [],
  exclude: [],
  skipHidden: false,
  skipDotfiles: false,
  followLinks: false,
  maxDepth: null,
  minSize: null,
  maxSize: null,
  modifiedAfter: null,
  modifiedBefore: null,
};

export interface PathFilter {
  /** Whether a directory/file/link should be skipped entirely (a skipped directory is not entered). */
  excluded(path: string, name: string): boolean;
  /** Whether a file passes the include globs and the size/age filters. */
  fileIncluded(entry: Pick<WalkEntry, 'path' | 'size' | 'mtimeMs'>): boolean;
}

function compile(globs: readonly string[]): ((value: string) => boolean) | null {
  const cleaned = globs.map((glob) => glob.trim()).filter(Boolean);
  if (!cleaned.length) return null;
  try {
    return picomatch(cleaned as string[], { dot: true, nocase: true });
  } catch {
    return null;
  }
}

/** Name globs match the entry's own name; globs containing `/` match its root-relative path. */
function splitNameAndPathGlobs(globs: readonly string[]): { names: string[]; paths: string[] } {
  const names: string[] = [];
  const paths: string[] = [];
  for (const glob of globs.map((value) => value.trim()).filter(Boolean)) (glob.includes('/') ? paths : names).push(glob.replace(/^\//, ''));
  return { names, paths };
}

export function createPathFilter(options: WalkOptions): PathFilter {
  const presets = options.useDefaultExcludes ? options.defaultExcludes ?? DEFAULT_EXCLUDES : [];
  const presetSplit = splitNameAndPathGlobs(presets);
  const excludeSplit = splitNameAndPathGlobs(options.exclude);
  const nameMatcher = compile([...presetSplit.names, ...excludeSplit.names]);
  const pathMatcher = compile([...presetSplit.paths, ...excludeSplit.paths]);
  const includeMatcher = compile(options.include.map((glob) => (glob.includes('/') ? glob.replace(/^\//, '') : `**/${glob}`)));
  return {
    excluded(path, name) {
      if (options.skipDotfiles && name.startsWith('.')) return true;
      if (nameMatcher?.(name)) return true;
      return !!pathMatcher?.(path);
    },
    fileIncluded(entry) {
      if (includeMatcher && !includeMatcher(entry.path)) return false;
      if (options.minSize != null && entry.size < options.minSize) return false;
      if (options.maxSize != null && entry.size > options.maxSize) return false;
      if (options.modifiedAfter != null && entry.mtimeMs < options.modifiedAfter) return false;
      if (options.modifiedBefore != null && entry.mtimeMs > options.modifiedBefore) return false;
      return true;
    },
  };
}

/** Normalizes untrusted (renderer-supplied) walk options to a well-formed, bounded object. */
export function sanitizeWalkOptions(raw: unknown): WalkOptions {
  const value = (raw && typeof raw === 'object' ? raw : {}) as Partial<Record<keyof WalkOptions, unknown>>;
  const globs = (list: unknown): string[] =>
    Array.isArray(list) ? list.filter((item): item is string => typeof item === 'string').map((item) => item.slice(0, 512)).slice(0, 200) : [];
  const bool = (flag: unknown, fallback: boolean) => (typeof flag === 'boolean' ? flag : fallback);
  const num = (input: unknown): number | null => (typeof input === 'number' && Number.isFinite(input) && input >= 0 ? input : null);
  return {
    useGitignore: bool(value.useGitignore, DEFAULT_WALK_OPTIONS.useGitignore),
    useDefaultExcludes: bool(value.useDefaultExcludes, DEFAULT_WALK_OPTIONS.useDefaultExcludes),
    ...(Array.isArray(value.defaultExcludes) ? { defaultExcludes: globs(value.defaultExcludes) } : {}),
    include: globs(value.include),
    exclude: globs(value.exclude),
    skipHidden: bool(value.skipHidden, false),
    skipDotfiles: bool(value.skipDotfiles, false),
    followLinks: bool(value.followLinks, false),
    maxDepth: num(value.maxDepth) === null ? null : Math.floor(num(value.maxDepth)!),
    minSize: num(value.minSize),
    maxSize: num(value.maxSize),
    modifiedAfter: num(value.modifiedAfter),
    modifiedBefore: num(value.modifiedBefore),
  };
}

/** One-line human summary of what a walk will skip — shown before a run starts. */
export function describeWalkOptions(options: WalkOptions): string {
  const parts: string[] = [];
  if (options.useGitignore) parts.push('.gitignore rules');
  if (options.useDefaultExcludes) parts.push('default excludes');
  if (options.exclude.length) parts.push(`${options.exclude.length} exclude glob(s)`);
  if (options.include.length) parts.push(`only ${options.include.join(', ')}`);
  if (options.skipHidden) parts.push('hidden/system files');
  if (options.skipDotfiles) parts.push('dotfiles');
  if (options.maxDepth != null) parts.push(`depth ≤ ${options.maxDepth}`);
  if (options.minSize != null || options.maxSize != null) parts.push('size filter');
  if (options.modifiedAfter != null || options.modifiedBefore != null) parts.push('date filter');
  const links = options.followLinks ? 'follows links inside the root' : 'links reported, not followed';
  return `${parts.length ? `Skips ${parts.join(', ')}` : 'No filters'}; ${links}.`;
}
