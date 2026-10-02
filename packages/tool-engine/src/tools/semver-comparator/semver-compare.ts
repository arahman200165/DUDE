/**
 * Pure, framework-free semantic-version comparison logic, built on the
 * `semver` package (npm's own reference implementation) since precedence
 * and range-satisfaction rules are easy to get subtly wrong by hand.
 */
import { compare, diff, parse, rsort, satisfies, valid, validRange } from 'semver';

export interface ParsedVersion {
  readonly raw: string;
  readonly major: number;
  readonly minor: number;
  readonly patch: number;
  readonly prerelease: readonly (string | number)[];
  readonly build: readonly string[];
}

export type CompareResult =
  | {
      readonly ok: true;
      readonly a: ParsedVersion;
      readonly b: ParsedVersion;
      readonly order: -1 | 0 | 1;
      readonly diffType: ReturnType<typeof diff>;
    }
  | { readonly ok: false; readonly error: string };

export function compareVersions(rawA: string, rawB: string): CompareResult {
  const a = parse(rawA);
  const b = parse(rawB);

  if (!a || !b) {
    const invalid = !a && !b ? `"${rawA}" and "${rawB}"` : !a ? `"${rawA}"` : `"${rawB}"`;
    return { ok: false, error: `Not a valid semantic version: ${invalid}` };
  }

  return {
    ok: true,
    a: toParsedVersion(rawA, a),
    b: toParsedVersion(rawB, b),
    order: compare(a, b),
    diffType: diff(a, b),
  };
}

export interface SortedVersions {
  readonly valid: readonly string[];
  readonly invalid: readonly string[];
}

export function sortVersions(lines: readonly string[], direction: 'asc' | 'desc' = 'asc'): SortedVersions {
  const trimmed = lines.map((line) => line.trim()).filter((line) => line !== '');
  const validVersions = trimmed.filter((line) => valid(line) !== null);
  const invalidVersions = trimmed.filter((line) => valid(line) === null);

  const sorted = direction === 'desc' ? rsort(validVersions) : rsort(validVersions).reverse();

  return { valid: sorted, invalid: invalidVersions };
}

export type RangeCheckResult =
  | { readonly ok: true; readonly satisfies: boolean; readonly normalizedRange: string }
  | { readonly ok: false; readonly error: string };

export function checkRange(version: string, range: string): RangeCheckResult {
  if (valid(version) === null) {
    return { ok: false, error: `Not a valid semantic version: "${version}"` };
  }

  const normalizedRange = validRange(range);
  if (normalizedRange === null) {
    return { ok: false, error: `Not a valid semver range: "${range}"` };
  }

  return { ok: true, satisfies: satisfies(version, range), normalizedRange };
}

/** A small fixed axis of versions spanning several majors/minors, probed against each range to visualize what it covers. */
export const RANGE_PROBE_VERSIONS: readonly string[] = [
  '0.1.0',
  '0.5.0',
  '0.9.0',
  '1.0.0',
  '1.2.0',
  '1.5.0',
  '1.9.0',
  '2.0.0',
  '2.5.0',
  '3.0.0',
  '4.0.0',
  '5.0.0',
  '10.0.0',
];

export type RangeVisualization =
  | { readonly range: string; readonly ok: true; readonly matches: readonly boolean[] }
  | { readonly range: string; readonly ok: false; readonly error: string };

/** Probes each of `RANGE_PROBE_VERSIONS` against every non-blank range line, for a visual "what does this range cover" view. */
export function visualizeRanges(rangeLines: readonly string[]): readonly RangeVisualization[] {
  return rangeLines
    .map((line) => line.trim())
    .filter((line) => line !== '')
    .map((range) => {
      if (validRange(range) === null) return { range, ok: false, error: `Not a valid semver range: "${range}"` };
      return { range, ok: true, matches: RANGE_PROBE_VERSIONS.map((version) => satisfies(version, range)) };
    });
}

function toParsedVersion(raw: string, parsed: NonNullable<ReturnType<typeof parse>>): ParsedVersion {
  return {
    raw,
    major: parsed.major,
    minor: parsed.minor,
    patch: parsed.patch,
    prerelease: parsed.prerelease,
    build: parsed.build,
  };
}
