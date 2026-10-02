import { describe, expect, it } from 'vitest';
import { parseYarnBerryLockfile } from "./lockfile-inspector-yarn-berry.js";

describe('parseYarnBerryLockfile', () => {
  it('parses entries and skips the __metadata header', () => {
    const yaml = [
      '__metadata:',
      '  version: 6',
      '',
      '"lodash@npm:^4.17.21":',
      '  version: 4.17.21',
      '  resolution: "lodash@npm:4.17.21"',
      '',
      '"@babel/core@npm:^7.0.0, @babel/core@npm:^7.12.3":',
      '  version: 7.20.0',
      '  resolution: "@babel/core@npm:7.20.0"',
      '  dependencies:',
      '    semver: ^6.3.0',
    ].join('\n');

    const result = parseYarnBerryLockfile(yaml);
    expect(result).toHaveLength(2);

    const lodash = result.find((p) => p.name === 'lodash');
    expect(lodash?.version).toBe('4.17.21');

    const babel = result.find((p) => p.name === '@babel/core');
    expect(babel?.dependencies).toEqual(['semver']);
  });
});
