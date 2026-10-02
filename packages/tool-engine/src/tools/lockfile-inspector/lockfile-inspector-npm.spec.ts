import { describe, expect, it } from 'vitest';
import { parseNpmLockfile } from "./lockfile-inspector-npm.js";

describe('parseNpmLockfile', () => {
  it('parses a lockfileVersion 2/3 "packages" map, skipping the root entry', () => {
    const data = {
      lockfileVersion: 3,
      packages: {
        '': { name: 'my-app', version: '1.0.0' },
        'node_modules/lodash': { version: '4.17.21', resolved: 'https://registry.npmjs.org/lodash/-/lodash-4.17.21.tgz' },
        'node_modules/lodash/node_modules/nested': { version: '1.0.0', dependencies: { lodash: '^4.0.0' } },
      },
    };

    const result = parseNpmLockfile(data);
    expect(result).toHaveLength(2);
    const lodash = result.find((p) => p.name === 'lodash');
    expect(lodash?.version).toBe('4.17.21');
    expect(lodash?.resolved).toContain('lodash-4.17.21.tgz');
    const nested = result.find((p) => p.name === 'nested');
    expect(nested?.dependencies).toEqual(['lodash']);
  });

  it('parses a lockfileVersion 1 nested "dependencies" tree', () => {
    const data = {
      lockfileVersion: 1,
      dependencies: {
        lodash: { version: '4.17.21', resolved: 'https://registry.npmjs.org/lodash/-/lodash-4.17.21.tgz', requires: {} },
        express: {
          version: '4.18.0',
          requires: { 'body-parser': '^1.20.0' },
          dependencies: { 'body-parser': { version: '1.20.0' } },
        },
      },
    };

    const result = parseNpmLockfile(data);
    const names = result.map((p) => p.name).sort();
    expect(names).toEqual(['body-parser', 'express', 'lodash']);
    expect(result.find((p) => p.name === 'express')?.dependencies).toEqual(['body-parser']);
  });
});
