/**
 * Reuses the existing semver-comparator's pure comparison logic instead of re-implementing
 * precedence/diff-type rules — see `../semver-comparator/semver-compare.ts`.
 */
import { compareVersions } from "../semver-comparator/semver-compare.js";

export interface ParsedDependencyLine {
  readonly name: string;
  readonly rawVersion: string;
  /** rawVersion with a leading range operator (^, ~, >=, etc.) stripped, for semver comparison. */
  readonly version: string;
}

function stripRangeOperators(version: string): string {
  return version.replace(/^(\^|~|>=|<=|>|<|=)+\s*/, '').trim();
}

function unquote(value: string): string {
  return value.trim().replace(/^["']|["']$/g, '').trim();
}

function buildParsed(rawName: string, rawVersionInput: string): ParsedDependencyLine {
  const name = unquote(rawName);
  const rawVersion = unquote(rawVersionInput.replace(/,\s*$/, ''));
  return { name, rawVersion, version: stripRangeOperators(rawVersion) };
}

/** Parses one line as `"name": "version"`, `name@version`, or `name version`. Returns null for a blank line or one that fits none of these shapes. */
export function parseDependencyLine(line: string): ParsedDependencyLine | null {
  const trimmed = line.trim();
  if (trimmed === '') return null;

  const colonMatch = trimmed.match(/^"?([^":]+)"?\s*:\s*"?([^",]+)"?,?$/);
  if (colonMatch) return buildParsed(colonMatch[1], colonMatch[2]);

  const at = trimmed.lastIndexOf('@');
  if (at > 0) return buildParsed(trimmed.slice(0, at), trimmed.slice(at + 1));

  const spaceMatch = trimmed.match(/^(\S+)\s+(\S+)$/);
  if (spaceMatch) return buildParsed(spaceMatch[1], spaceMatch[2]);

  return null;
}

export function parseDependencyList(text: string): ReadonlyMap<string, ParsedDependencyLine> {
  const map = new Map<string, ParsedDependencyLine>();
  for (const line of text.split('\n')) {
    const parsed = parseDependencyLine(line);
    if (parsed) map.set(parsed.name, parsed);
  }
  return map;
}

export type DependencyChangeKind = 'added' | 'removed' | 'unchanged' | 'upgraded-major' | 'upgraded-minor' | 'upgraded-patch' | 'downgraded' | 'changed';

export interface DependencyDiffEntry {
  readonly name: string;
  readonly before: string | null;
  readonly after: string | null;
  readonly kind: DependencyChangeKind;
}

function classifyChange(before: ParsedDependencyLine, after: ParsedDependencyLine): DependencyChangeKind {
  const comparison = compareVersions(before.version, after.version);
  if (!comparison.ok) return 'changed'; // one or both sides aren't valid bare semver — can't classify magnitude/direction

  if (comparison.order === 0) return 'unchanged';
  if (comparison.order > 0) return 'downgraded';

  if (comparison.diffType === 'major' || comparison.diffType === 'premajor') return 'upgraded-major';
  if (comparison.diffType === 'minor' || comparison.diffType === 'preminor') return 'upgraded-minor';
  return 'upgraded-patch';
}

/** Diffs two pasted dependency lists, classifying each change by semver magnitude/direction where both sides parse as valid versions. */
export function diffDependencyLists(beforeText: string, afterText: string): readonly DependencyDiffEntry[] {
  const before = parseDependencyList(beforeText);
  const after = parseDependencyList(afterText);
  const names = new Set([...before.keys(), ...after.keys()]);

  const entries: DependencyDiffEntry[] = [];
  for (const name of names) {
    const beforeEntry = before.get(name);
    const afterEntry = after.get(name);

    if (!beforeEntry) {
      entries.push({ name, before: null, after: afterEntry!.rawVersion, kind: 'added' });
    } else if (!afterEntry) {
      entries.push({ name, before: beforeEntry.rawVersion, after: null, kind: 'removed' });
    } else if (beforeEntry.rawVersion === afterEntry.rawVersion) {
      entries.push({ name, before: beforeEntry.rawVersion, after: afterEntry.rawVersion, kind: 'unchanged' });
    } else {
      entries.push({ name, before: beforeEntry.rawVersion, after: afterEntry.rawVersion, kind: classifyChange(beforeEntry, afterEntry) });
    }
  }

  return entries.sort((a, b) => a.name.localeCompare(b.name));
}
