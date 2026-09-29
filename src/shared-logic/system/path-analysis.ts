import { expandEnvStrings } from './env-expand';
import type { ProbeDirEntry } from './system-types';

/**
 * Pure PATH analysis for the PATH Editor & Conflict Detector (DUDE_PRD.md §21 Phase 31, Milestone 599).
 * The tool passes in the raw PATH string, an expansion map and the directory probe results; nothing here
 * touches the registry or the filesystem.
 */

/** Windows' legacy display/`setx` truncation point; a longer PATH still works but breaks older tools. */
export const PATH_SOFT_LIMIT = 2048;
/** MAX_PATH; a longer directory entry breaks tools that are not long-path aware. */
export const ENTRY_LENGTH_LIMIT = 260;
/** Registry value ceiling for an environment variable. */
export const PATH_HARD_LIMIT = 32767;

export interface PathEntry {
  /** The entry exactly as it should be written back (trimmed, quotes kept). */
  readonly raw: string;
  /** `raw` without surrounding quotes. */
  readonly value: string;
  /** `value` with `%VAR%` references expanded (unknown references left as written). */
  readonly expanded: string;
  readonly index: number;
  readonly quoted: boolean;
  readonly empty: boolean;
}

export type PathScope = 'user' | 'machine';
export interface ScopedPathEntry extends PathEntry { readonly scope: PathScope }

export type PathIssueKind =
  | 'duplicate' | 'missing' | 'not-directory' | 'unresolved' | 'empty' | 'relative' | 'quoted' | 'long-entry' | 'unreadable';
export type PathIssueSeverity = 'error' | 'warning' | 'info';

export interface PathIssue {
  readonly kind: PathIssueKind;
  readonly severity: PathIssueSeverity;
  readonly message: string;
  /** For 'duplicate': the index of the first entry it repeats. */
  readonly duplicateOf?: number;
}

export interface EntryAnalysis {
  readonly index: number;
  readonly issues: readonly PathIssue[];
}

export interface GlobalPathIssue {
  readonly kind: 'path-too-long' | 'path-over-limit';
  readonly severity: PathIssueSeverity;
  readonly message: string;
}

export interface PathAnalysis {
  readonly entries: readonly EntryAnalysis[];
  readonly global: readonly GlobalPathIssue[];
  readonly totalLength: number;
}

type EnvLike = ReadonlyMap<string, string> | Readonly<Record<string, string>>;

function makeEntry(part: string, index: number, env: EnvLike): PathEntry {
  const trimmed = part.trim();
  const quoted = trimmed.includes('"');
  const value = quoted ? trimmed.replace(/"/g, '').trim() : trimmed;
  return { raw: trimmed, value, expanded: expandEnvStrings(value, env), index, quoted, empty: trimmed === '' };
}

/**
 * Splits a PATH value on `;`. Entries are trimmed and surrounding quotes stripped from `value`
 * (but flagged); a trailing run of empty entries (the usual trailing `;`) is dropped, while empty
 * entries elsewhere are kept and flagged by `analyzePath`.
 */
export function parsePath(raw: string, env: EnvLike = {}): PathEntry[] {
  const parts = raw.split(';');
  while (parts.length && parts[parts.length - 1].trim() === '') parts.pop();
  return parts.map((part, index) => makeEntry(part, index, env));
}

/** Re-parses a list of edited raw entries (one per element, `;` not split) so `expanded`/`index` track the edit. */
export function entriesFromRaw(raws: readonly string[], env: EnvLike = {}): PathEntry[] {
  return raws.map((raw, index) => makeEntry(raw, index, env));
}

/** Joins raw entries into the value that would be written to the registry (empty entries dropped). */
export function joinPath(raws: readonly string[]): string {
  return raws.map((r) => r.trim()).filter((r) => r !== '').join(';');
}

/**
 * The comparison/probe key for a directory: forward slashes become backslashes, repeated separators
 * collapse (a UNC prefix is kept), the trailing backslash goes (a drive root keeps one) and case folds.
 */
export function normalizeDir(dir: string): string {
  let s = dir.trim().replace(/\//g, '\\');
  const unc = s.startsWith('\\\\');
  s = s.replace(/\\{2,}/g, '\\');
  if (unc) s = '\\' + s;
  if (s.length > 3 && s.endsWith('\\')) s = s.replace(/\\+$/, '');
  if (/^[a-z]:$/i.test(s)) s += '\\';
  return s.toLowerCase();
}

const UNRESOLVED = /%[^%\r\n]+%/;
const ABSOLUTE = /^(?:[a-zA-Z]:[\\/]|\\\\|\/\/)/;

export const isAbsoluteDir = (dir: string): boolean => ABSOLUTE.test(dir);
export const hasUnresolved = (expanded: string): boolean => UNRESOLVED.test(expanded);

/** The entries that can be probed on disk: non-empty, fully expanded and absolute. */
export function probeTargets(entries: readonly PathEntry[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const e of entries) {
    if (e.empty || hasUnresolved(e.expanded) || !isAbsoluteDir(e.expanded)) continue;
    const key = normalizeDir(e.expanded);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(e.expanded);
  }
  return out;
}

/** Builds the lookup `analyzePath`/`detectShadows` expect from probe results (keyed by `normalizeDir`). */
export function probeMap(results: readonly ProbeDirEntry[]): Map<string, ProbeDirEntry> {
  const map = new Map<string, ProbeDirEntry>();
  for (const r of results) map.set(normalizeDir(r.dir), r);
  return map;
}

/** Per-entry findings plus the whole-PATH findings. `probe` is keyed by `normalizeDir`. */
export function analyzePath(entries: readonly PathEntry[], probe: ReadonlyMap<string, ProbeDirEntry>): PathAnalysis {
  const firstSeen = new Map<string, number>();
  const analyses: EntryAnalysis[] = entries.map((e) => {
    const issues: PathIssue[] = [];
    if (e.empty) {
      issues.push({ kind: 'empty', severity: 'warning', message: 'Empty entry (a stray ";;"). Windows ignores it, but it is noise.' });
      return { index: e.index, issues };
    }
    if (e.quoted) issues.push({ kind: 'quoted', severity: 'warning', message: 'Wrapped in quotes. PATH entries should not be quoted; some tools fail to resolve them.' });
    if (e.expanded.length > ENTRY_LENGTH_LIMIT) issues.push({ kind: 'long-entry', severity: 'warning', message: `Entry is ${e.expanded.length} characters, longer than the ${ENTRY_LENGTH_LIMIT}-character MAX_PATH limit.` });

    const unresolved = hasUnresolved(e.expanded);
    if (unresolved) {
      const names = [...new Set(e.expanded.match(/%[^%\r\n]+%/g) ?? [])].join(', ');
      issues.push({ kind: 'unresolved', severity: 'error', message: `Contains ${names}, which is not defined in the user, machine or session environment.` });
    } else if (!isAbsoluteDir(e.expanded)) {
      issues.push({ kind: 'relative', severity: 'warning', message: 'Relative path. It resolves against each program\'s current directory, which is unpredictable and a hijack risk.' });
    } else {
      const key = normalizeDir(e.expanded);
      const first = firstSeen.get(key);
      if (first === undefined) firstSeen.set(key, e.index);
      else issues.push({ kind: 'duplicate', severity: 'warning', message: `Duplicate of entry ${first + 1}.`, duplicateOf: first });

      const p = probe.get(key);
      if (p) {
        if (!p.exists) issues.push({ kind: 'missing', severity: 'error', message: 'Directory does not exist.' });
        else if (!p.isDirectory) issues.push({ kind: 'not-directory', severity: 'error', message: 'Path is a file, not a directory.' });
        else if (p.error) issues.push({ kind: 'unreadable', severity: 'info', message: `Could not be read: ${p.error}` });
      }
    }
    return { index: e.index, issues };
  });

  const totalLength = joinPath(entries.map((e) => e.raw)).length;
  const global: GlobalPathIssue[] = [];
  if (totalLength > PATH_HARD_LIMIT) global.push({ kind: 'path-over-limit', severity: 'error', message: `PATH is ${totalLength} characters; Windows cannot store an environment variable over ${PATH_HARD_LIMIT}.` });
  else if (totalLength > PATH_SOFT_LIMIT) global.push({ kind: 'path-too-long', severity: 'warning', message: `PATH is ${totalLength} characters. Values over ${PATH_SOFT_LIMIT} are truncated by setx and misbehave in older tools.` });
  return { entries: analyses, global, totalLength };
}

/** Removes later duplicates (after normalization and expansion), keeping the first; empty entries go too. */
export function dedupeRaw(raws: readonly string[], env: EnvLike = {}): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of raws) {
    const trimmed = raw.trim();
    if (!trimmed) continue;
    const e = parsePath(trimmed, env)[0];
    const key = e && !hasUnresolved(e.expanded) ? normalizeDir(e.expanded) : trimmed.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(trimmed);
  }
  return out;
}

/** Moves one item; out-of-range targets clamp. Returns a new array. */
export function moveItem<T>(items: readonly T[], from: number, to: number): T[] {
  const out = [...items];
  if (from < 0 || from >= out.length) return out;
  const target = Math.max(0, Math.min(out.length - 1, to));
  const [item] = out.splice(from, 1);
  out.splice(target, 0, item);
  return out;
}

/** Machine PATH first, then user PATH: the order Windows composes the effective PATH. */
export function effectiveEntries(machine: readonly PathEntry[], user: readonly PathEntry[]): ScopedPathEntry[] {
  const all: ScopedPathEntry[] = [
    ...machine.filter((e) => !e.empty).map((e) => ({ ...e, scope: 'machine' as const })),
    ...user.filter((e) => !e.empty).map((e) => ({ ...e, scope: 'user' as const })),
  ];
  return all.map((e, index) => ({ ...e, index }));
}

// ---- shadows ---------------------------------------------------------------------------------------

export interface ShadowCandidate {
  readonly dir: string;
  readonly index: number;
  /** The file in this directory that would run (the PATHEXT-preferred one). */
  readonly file: string;
  /** Other same-name files in this directory that lose to `file` on PATHEXT order. */
  readonly alsoInDir: readonly string[];
  /** True for a `...\Microsoft\WindowsApps` App Execution Alias directory. */
  readonly appExecutionAlias: boolean;
}

export interface ShadowConflict {
  /** Lower-case base name without extension, e.g. 'node'. */
  readonly name: string;
  readonly winner: ShadowCandidate;
  readonly shadowed: readonly ShadowCandidate[];
  /** A well-known developer tool; sorts first. */
  readonly common: boolean;
  /** Set when a WindowsApps alias stub wins, or is present, for a name that is usually a real install. */
  readonly note?: string;
}

export const COMMON_EXECUTABLES: ReadonlySet<string> = new Set([
  'node', 'npm', 'npx', 'git', 'java', 'javac', 'python', 'python3', 'pip', 'pip3', 'py', 'dotnet', 'go', 'ruby', 'php', 'cargo', 'rustc', 'code', 'pwsh', 'powershell', 'curl', 'tar', 'bash', 'winget',
]);

const APP_ALIAS = /\\microsoft\\windowsapps$/i;
const ALIAS_STUB_NAMES: ReadonlySet<string> = new Set(['python', 'python3', 'pythonw', 'pip', 'pip3', 'bash']);

const extOf = (file: string): string => {
  const dot = file.lastIndexOf('.');
  return dot > 0 ? file.slice(dot).toLowerCase() : '';
};
const baseOf = (file: string): string => {
  const dot = file.lastIndexOf('.');
  return (dot > 0 ? file.slice(0, dot) : file).toLowerCase();
};

/**
 * Executables that appear in more than one PATH directory: the first directory in PATH order wins.
 * Within one directory the file whose extension comes first in `pathext` wins. Directories are
 * de-duplicated by normalized path, so a repeated directory never shadows itself. Missing, empty and
 * unresolved entries contribute nothing.
 */
export function detectShadows(entries: readonly PathEntry[], probe: ReadonlyMap<string, ProbeDirEntry>, pathext: readonly string[]): ShadowConflict[] {
  const order = new Map<string, number>();
  pathext.forEach((x, i) => { const k = x.toLowerCase(); if (!order.has(k)) order.set(k, i); });
  const seenDirs = new Set<string>();
  const byName = new Map<string, ShadowCandidate[]>();

  for (const e of entries) {
    if (e.empty || hasUnresolved(e.expanded) || !isAbsoluteDir(e.expanded)) continue;
    const key = normalizeDir(e.expanded);
    if (seenDirs.has(key)) continue;
    seenDirs.add(key);
    const p = probe.get(key);
    if (!p || !p.exists || !p.isDirectory) continue;

    const groups = new Map<string, string[]>();
    for (const file of p.executables) {
      if (order.size && !order.has(extOf(file))) continue;
      const base = baseOf(file);
      const list = groups.get(base);
      if (list) list.push(file); else groups.set(base, [file]);
    }
    for (const [base, files] of groups) {
      const sorted = [...files].sort((a, b) => (order.get(extOf(a)) ?? 999) - (order.get(extOf(b)) ?? 999) || a.localeCompare(b));
      const candidate: ShadowCandidate = { dir: e.expanded, index: e.index, file: sorted[0], alsoInDir: sorted.slice(1), appExecutionAlias: APP_ALIAS.test(key) };
      const list = byName.get(base);
      if (list) list.push(candidate); else byName.set(base, [candidate]);
    }
  }

  const out: ShadowConflict[] = [];
  for (const [name, candidates] of byName) {
    if (candidates.length < 2) continue;
    const [winner, ...shadowed] = candidates;
    let note: string | undefined;
    if (ALIAS_STUB_NAMES.has(name)) {
      if (winner.appExecutionAlias) note = 'The WindowsApps App Execution Alias wins. It is usually a Store installer stub, not a real install; turn the alias off in Settings > Apps > Advanced app settings > App execution aliases, or move the real install ahead of it.';
      else if (shadowed.some((c) => c.appExecutionAlias)) note = 'A WindowsApps App Execution Alias is also on PATH but is shadowed by an earlier real install.';
    }
    out.push({ name, winner, shadowed, common: COMMON_EXECUTABLES.has(name), ...(note ? { note } : {}) });
  }
  return out.sort((a, b) => Number(b.common) - Number(a.common) || a.name.localeCompare(b.name));
}

/** Parses a PATHEXT value (`.COM;.EXE`) into lower-case dot-prefixed extensions. */
export function parsePathExt(value: string): string[] {
  return value.split(';').map((s) => s.trim().toLowerCase()).filter((s) => s.startsWith('.') && s.length > 1);
}

/** Used when PATHEXT cannot be read from the registry. */
export const DEFAULT_PATHEXT: readonly string[] = ['.com', '.exe', '.bat', '.cmd', '.vbs', '.vbe', '.js', '.jse', '.wsf', '.wsh', '.msc'];

/** System variables Windows sets per process that never live in the registry environment (lowest priority for expansion). */
export const SYSTEM_EXPANSION_DEFAULTS: Readonly<Record<string, string>> = {
  systemroot: 'C:\\Windows',
  windir: 'C:\\Windows',
  systemdrive: 'C:',
  programfiles: 'C:\\Program Files',
  'programfiles(x86)': 'C:\\Program Files (x86)',
  programdata: 'C:\\ProgramData',
};
