import fc from 'fast-check';
import { describe, it } from 'vitest';
import { invariant, neverThrows } from "../../../../../../tests/property-harness";
import { compareVersions, sortVersions } from "@dude/tool-engine/tools/semver-comparator/semver-compare";

const version = fc.tuple(fc.nat(100), fc.nat(100), fc.nat(100)).map(([a, b, c]) => `${a}.${b}.${c}`);

describe('semver comparator properties', () => {
  it('compares a valid version with itself as equal', () => {
    invariant((v: string) => compareVersions(v, v), version, (result) => result.ok && result.order === 0);
  });

  it('never throws while sorting arbitrary version text', () => {
    neverThrows((lines: string[]) => sortVersions(lines), fc.array(fc.string()));
  });
});
