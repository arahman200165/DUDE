import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import { existsSync, promises as fs, type Dirent } from 'node:fs';
import { join, sep } from 'node:path';
import { createInterface } from 'node:readline';
import type { WalkEntry, WalkIssue, WalkOptions, WalkStats } from '../src/shared-logic/fs/fs-types';
import { createPathFilter } from '../src/shared-logic/fs/walk-filter';
import { isIgnoredByLayers, parseGitignoreRules, type GitignoreLayer } from '../src/shared-logic/fs/gitignore';

/**
 * The shared native tree walker (DUDE_PRD.md §21 Phase 29, Milestone 523) that every Phase 29 tree
 * tool runs inside the fs utility process. Iterative (no recursion depth limit on deep trees),
 * streaming (entries reach the caller as they're found, never materialized all at once), cancellable
 * between directories, and non-fatal on access-denied subtrees (reported as issues). Links are
 * reported rather than traversed unless `followLinks` is set, and even then only when the target
 * resolves inside the walk root — a walk never widens what the user granted.
 */

export interface WalkHooks {
  readonly signal: AbortSignal;
  onEntry(entry: WalkEntry): void | Promise<void>;
  onIssue?(issue: WalkIssue): void;
  /** When set, directories are also passed to `onEntry` (always true for size/tree tools). */
  readonly includeDirs?: boolean;
}

const HIDDEN = 0x2;
const SYSTEM = 0x4;
const STAT_CONCURRENCY = 32;

/** Long-lived `fs-attrs.exe` client — started lazily, only when a walk skips hidden/system files. */
export class AttributeReader {
  private child: ChildProcessWithoutNullStreams | null = null;
  private queue: ((line: string) => void)[] = [];
  constructor(private readonly helper: string) {}

  static available(helper: string): boolean { return existsSync(helper); }

  async list(dir: string): Promise<Map<string, number> | null> {
    const child = this.ensure();
    if (!child) return null;
    const line = await new Promise<string>((resolve) => {
      this.queue.push(resolve);
      child.stdin.write(`${dir}\n`, 'utf8');
    });
    try {
      const parsed = JSON.parse(line) as { entries?: [string, number][] };
      return parsed.entries ? new Map(parsed.entries) : null;
    } catch { return null; }
  }

  private ensure(): ChildProcessWithoutNullStreams | null {
    if (this.child) return this.child;
    if (!AttributeReader.available(this.helper)) return null;
    const child = spawn(this.helper, [], { shell: false, windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'] });
    createInterface({ input: child.stdout }).on('line', (line) => this.queue.shift()?.(line));
    child.once('exit', () => { this.child = null; for (const resolve of this.queue.splice(0)) resolve('{}'); });
    child.once('error', () => { this.child = null; });
    this.child = child;
    return child;
  }

  close(): void { this.child?.stdin.end(); this.child?.kill(); this.child = null; }
}

let sharedAttributeReader: AttributeReader | null = null;
export function attributeReader(helper: string): AttributeReader {
  sharedAttributeReader ??= new AttributeReader(helper);
  return sharedAttributeReader;
}

function issueFor(path: string, error: unknown): WalkIssue {
  const code = typeof error === 'object' && error && 'code' in error ? String((error as { code: unknown }).code) : 'UNKNOWN';
  return { path, code, message: error instanceof Error ? error.message : String(error) };
}

async function readGitignore(dir: string): Promise<string | null> {
  try { return await fs.readFile(join(dir, '.gitignore'), 'utf8'); } catch { return null; }
}

interface Pending { readonly absolute: string; readonly relative: string; readonly depth: number; readonly layers: readonly GitignoreLayer[] }

export async function walkTree(root: string, options: WalkOptions, hooks: WalkHooks, attributes?: AttributeReader | null): Promise<WalkStats> {
  const filter = createPathFilter(options);
  const stats = { files: 0, dirs: 0, links: 0, bytes: 0, skipped: 0, issues: 0 };
  const visitedReal = new Set<string>();
  const report = (issue: WalkIssue) => { stats.issues++; hooks.onIssue?.(issue); };
  const rootLayers: GitignoreLayer[] = [];
  if (options.useGitignore) {
    const exclude = await fs.readFile(join(root, '.git', 'info', 'exclude'), 'utf8').catch(() => null);
    if (exclude) rootLayers.push({ base: '', rules: parseGitignoreRules(exclude) });
  }
  try { visitedReal.add((await fs.realpath(root)).toLowerCase()); } catch { /* root vanished; opendir reports it */ }
  const stack: Pending[] = [{ absolute: root, relative: '', depth: 0, layers: rootLayers }];
  const rootPrefix = (root.endsWith(sep) ? root : root + sep).toLowerCase();
  if (options.skipHidden && !attributes) report({ path: '', code: 'NO_ATTR_HELPER', message: 'The Windows attribute helper is unavailable, so hidden/system files could not be detected.' });

  while (stack.length) {
    if (hooks.signal.aborted) throw new Error('Cancelled.');
    const current = stack.pop()!;
    let children: Dirent[];
    try {
      children = await fs.readdir(current.absolute, { withFileTypes: true });
    } catch (error) {
      report(issueFor(current.relative, error));
      continue;
    }
    let layers = current.layers;
    if (options.useGitignore) {
      const text = await readGitignore(current.absolute);
      if (text) layers = [...layers, { base: current.relative, rules: parseGitignoreRules(text) }];
    }
    const attrs = options.skipHidden && attributes ? await attributes.list(current.absolute) : null;
    children.sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
    const subdirs: Pending[] = [];

    const candidates = children.filter((child) => {
      const relative = current.relative ? `${current.relative}/${child.name}` : child.name;
      const isDir = child.isDirectory();
      const attr = attrs?.get(child.name);
      if ((attr !== undefined && attr & (HIDDEN | SYSTEM)) || filter.excluded(relative, child.name) || (options.useGitignore && isIgnoredByLayers(layers, relative, isDir))) {
        stats.skipped++;
        return false;
      }
      return true;
    });

    for (let index = 0; index < candidates.length; index += STAT_CONCURRENCY) {
      if (hooks.signal.aborted) throw new Error('Cancelled.');
      const slice = candidates.slice(index, index + STAT_CONCURRENCY);
      const resolved = await Promise.all(slice.map(async (child) => {
        const absolute = join(current.absolute, child.name);
        const relative = current.relative ? `${current.relative}/${child.name}` : child.name;
        try {
          const info = await fs.lstat(absolute);
          return { child, absolute, relative, info };
        } catch (error) {
          report(issueFor(relative, error));
          return null;
        }
      }));
      for (const item of resolved) {
        if (!item) continue;
        const { absolute, relative, info } = item;
        if (info.isSymbolicLink()) {
          const target = await fs.readlink(absolute).catch(() => '');
          let followed = false;
          if (options.followLinks) {
            const real = await fs.realpath(absolute).catch(() => '');
            const key = real.toLowerCase();
            if (real && key.startsWith(rootPrefix) && !visitedReal.has(key)) {
              const targetInfo = await fs.stat(real).catch(() => null);
              if (targetInfo?.isDirectory() && (options.maxDepth == null || current.depth < options.maxDepth)) {
                visitedReal.add(key);
                subdirs.push({ absolute, relative, depth: current.depth + 1, layers });
                followed = true;
              }
            }
          }
          stats.links++;
          await hooks.onEntry({ path: relative, kind: 'link', size: 0, mtimeMs: info.mtimeMs, depth: current.depth, linkTarget: target, followed });
        } else if (info.isDirectory()) {
          stats.dirs++;
          if (hooks.includeDirs) await hooks.onEntry({ path: relative, kind: 'dir', size: 0, mtimeMs: info.mtimeMs, depth: current.depth });
          if (options.maxDepth == null || current.depth < options.maxDepth) {
            if (options.followLinks) {
              const real = await fs.realpath(absolute).catch(() => absolute);
              if (visitedReal.has(real.toLowerCase())) continue;
              visitedReal.add(real.toLowerCase());
            }
            subdirs.push({ absolute, relative, depth: current.depth + 1, layers });
          }
        } else if (info.isFile()) {
          const entry: WalkEntry = { path: relative, kind: 'file', size: info.size, mtimeMs: info.mtimeMs, depth: current.depth };
          if (!filter.fileIncluded(entry)) { stats.skipped++; continue; }
          stats.files++;
          stats.bytes += info.size;
          await hooks.onEntry(entry);
        }
      }
    }
    // Reverse so the stack pops children in sorted order (deterministic, tree-like output).
    for (let index = subdirs.length - 1; index >= 0; index--) stack.push(subdirs[index]);
  }
  return stats;
}
