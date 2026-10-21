import { checkRange, compareVersions, RANGE_PROBE_VERSIONS, sortVersions, visualizeRanges } from '@dude/tool-engine/tools/semver-comparator/semver-compare';
import type { KeyValueRow } from '../../kit';

export type SemverMode = 'compare' | 'sort' | 'range' | 'visualize';
export const SEMVER_MODES: readonly { readonly id: SemverMode; readonly label: string }[] = [
  { id: 'compare', label: 'Compare' }, { id: 'sort', label: 'Sort' }, { id: 'range', label: 'Range check' }, { id: 'visualize', label: 'Visualize' },
];
export type SortDirection = 'asc' | 'desc';

/** Same session defaults as the web tool. */
export const DEFAULT_INPUTS = {
  versionA: '1.2.3', versionB: '1.3.0', list: '1.2.3\n1.0.0\n2.0.0-beta.1\n1.10.0', rangeVersion: '1.2.5', range: '^1.2.0', visualizeInput: '^1.2.0\n>=1.0.0 <2.0.0\n~2.5.0',
};

export type RowsOutcome = { readonly ok: true; readonly rows: readonly KeyValueRow[] } | { readonly ok: false; readonly error: string };

const dotted = (parts: readonly (string | number)[]): string => parts.length ? parts.join('.') : '(none)';

export function compareRows(versionA: string, versionB: string): RowsOutcome {
  const result = compareVersions(versionA, versionB);
  if (!result.ok) return result;
  const relation = result.order === 0 ? 'Version A equals Version B' : result.order < 0 ? 'Version A < Version B' : 'Version A > Version B';
  const core = (version: typeof result.a) => `${version.major}.${version.minor}.${version.patch}`;
  return {
    ok: true,
    rows: [
      { key: 'result', label: 'Result', value: relation },
      { key: 'diff', label: 'Difference', value: result.diffType ?? 'none (identical)' },
      { key: 'a-core', label: 'A major.minor.patch', value: core(result.a) },
      { key: 'b-core', label: 'B major.minor.patch', value: core(result.b) },
      { key: 'a-prerelease', label: 'A prerelease', value: dotted(result.a.prerelease) },
      { key: 'b-prerelease', label: 'B prerelease', value: dotted(result.b.prerelease) },
      { key: 'a-build', label: 'A build', value: dotted(result.a.build) },
      { key: 'b-build', label: 'B build', value: dotted(result.b.build) },
    ],
  };
}

export function sortView(list: string, direction: SortDirection): { readonly sorted: string; readonly invalid: readonly string[] } {
  const result = sortVersions(list.split('\n'), direction);
  return { sorted: result.valid.join('\n'), invalid: result.invalid };
}

export function rangeRows(version: string, range: string): RowsOutcome {
  const result = checkRange(version, range);
  if (!result.ok) return result;
  return {
    ok: true,
    rows: [
      { key: 'result', label: 'Result', value: result.satisfies ? 'satisfies' : 'does not satisfy' },
      { key: 'normalized', label: 'Normalized range', value: result.normalizedRange },
    ],
  };
}

export interface RangeCoverage { readonly range: string; readonly ok: true; readonly cells: readonly { readonly version: string; readonly match: boolean }[]; readonly matched: string }
export interface RangeCoverageError { readonly range: string; readonly ok: false; readonly error: string }

export function coverageView(input: string): readonly (RangeCoverage | RangeCoverageError)[] {
  return visualizeRanges(input.split('\n')).map((entry): RangeCoverage | RangeCoverageError => {
    if (!entry.ok) return entry;
    const cells = RANGE_PROBE_VERSIONS.map((version, index) => ({ version, match: entry.matches[index] === true }));
    const matched = cells.filter(cell => cell.match).map(cell => cell.version);
    return { range: entry.range, ok: true, cells, matched: matched.length ? matched.join(', ') : '(none)' };
  });
}

export const decodeSemverMode = (raw: unknown): SemverMode | null => SEMVER_MODES.find(mode => mode.id === raw)?.id ?? null;
export const decodeSortDirection = (raw: unknown): SortDirection | null => raw === 'asc' || raw === 'desc' ? raw : null;
