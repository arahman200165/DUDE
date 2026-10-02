import { describe, expect, it } from 'vitest';
import { parsePnpmLockfile } from "./lockfile-inspector-pnpm.js";

describe('parsePnpmLockfile', () => {
  it('parses package keys with a leading slash and an integrity hash', () => {
    const yaml = [
      'lockfileVersion: 5.4',
      'packages:',
      '  /lodash@4.17.21:',
      '    resolution: {integrity: sha512-abc123}',
      '  /express@4.18.0:',
      '    resolution: {integrity: sha512-def456}',
      '    dependencies:',
      '      body-parser: 1.20.0',
    ].join('\n');

    const result = parsePnpmLockfile(yaml);
    expect(result).toHaveLength(2);
    const lodash = result.find((p) => p.name === 'lodash');
    expect(lodash?.version).toBe('4.17.21');
    expect(lodash?.resolved).toBe('sha512-abc123');
    expect(result.find((p) => p.name === 'express')?.dependencies).toEqual(['body-parser']);
  });

  it('strips a peer-dependency hash suffix from the version', () => {
    const yaml = ['packages:', '  /react-dom@18.2.0_react@18.2.0:', '    resolution: {integrity: sha512-xyz}'].join('\n');
    const result = parsePnpmLockfile(yaml);
    expect(result[0].version).toBe('18.2.0');
  });

  it('parses keys without a leading slash (newer pnpm)', () => {
    const yaml = ['packages:', '  lodash@4.17.21:', '    resolution: {integrity: sha512-abc}'].join('\n');
    const result = parsePnpmLockfile(yaml);
    expect(result[0]).toEqual({ name: 'lodash', version: '4.17.21', resolved: 'sha512-abc', dependencies: [] });
  });
});
