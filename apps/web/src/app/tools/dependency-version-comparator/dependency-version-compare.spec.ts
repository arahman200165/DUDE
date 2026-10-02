import { describe, expect, it } from 'vitest';
import { diffDependencyLists, parseDependencyLine } from "@dude/tool-engine/tools/dependency-version-comparator/dependency-version-compare";

describe('parseDependencyLine', () => {
  it('parses the "name": "version" JSON style, including scoped packages', () => {
    expect(parseDependencyLine('"lodash": "^4.17.21",')).toEqual({ name: 'lodash', rawVersion: '^4.17.21', version: '4.17.21' });
    expect(parseDependencyLine('"@angular/core": "^22.1.0"')).toEqual({ name: '@angular/core', rawVersion: '^22.1.0', version: '22.1.0' });
  });

  it('parses the name@version style, including scoped packages', () => {
    expect(parseDependencyLine('lodash@4.17.21')).toEqual({ name: 'lodash', rawVersion: '4.17.21', version: '4.17.21' });
    expect(parseDependencyLine('@angular/core@22.1.0')).toEqual({ name: '@angular/core', rawVersion: '22.1.0', version: '22.1.0' });
  });

  it('parses a whitespace-separated fallback', () => {
    expect(parseDependencyLine('lodash 4.17.21')).toEqual({ name: 'lodash', rawVersion: '4.17.21', version: '4.17.21' });
  });

  it('returns null for a blank line', () => {
    expect(parseDependencyLine('   ')).toBeNull();
  });
});

describe('diffDependencyLists', () => {
  it('classifies added, removed, and unchanged dependencies', () => {
    const before = 'lodash@1.0.0\nleft-pad@1.0.0';
    const after = 'lodash@1.0.0\nright-pad@1.0.0';

    const diff = diffDependencyLists(before, after);
    expect(diff.find((d) => d.name === 'lodash')?.kind).toBe('unchanged');
    expect(diff.find((d) => d.name === 'left-pad')?.kind).toBe('removed');
    expect(diff.find((d) => d.name === 'right-pad')?.kind).toBe('added');
  });

  it('classifies a major, minor, and patch upgrade, and a downgrade', () => {
    const before = 'a@1.0.0\nb@1.1.0\nc@1.1.1\nd@2.0.0';
    const after = 'a@2.0.0\nb@1.2.0\nc@1.1.2\nd@1.0.0';

    const diff = diffDependencyLists(before, after);
    expect(diff.find((d) => d.name === 'a')?.kind).toBe('upgraded-major');
    expect(diff.find((d) => d.name === 'b')?.kind).toBe('upgraded-minor');
    expect(diff.find((d) => d.name === 'c')?.kind).toBe('upgraded-patch');
    expect(diff.find((d) => d.name === 'd')?.kind).toBe('downgraded');
  });

  it('strips range operators before comparing', () => {
    const diff = diffDependencyLists('"pkg": "^1.0.0"', '"pkg": "^2.0.0"');
    expect(diff[0].kind).toBe('upgraded-major');
  });

  it('falls back to "changed" when a version cannot be parsed as bare semver', () => {
    const diff = diffDependencyLists('pkg@not-a-version', 'pkg@also-not-a-version');
    expect(diff[0].kind).toBe('changed');
  });
});
