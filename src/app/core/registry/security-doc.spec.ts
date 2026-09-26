import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { TOOL_DEFINITIONS } from './tool-definitions';

// Drift check for SECURITY.md's generated tables (scripts/generate-security-doc.mjs,
// DUDE_PRD.md §21 Phase 23 Items 7 & 13) -- mirrors tool-count.spec.ts's README drift check.

describe('SECURITY.md generated tables', () => {
  const securityPath = resolve(process.cwd(), 'SECURITY.md');
  const doc = readFileSync(securityPath, 'utf-8').replace(/\r\n/g, '\n');

  it('has one High-Consequence Tool Matrix row per (tool, consequenceClass) pair', () => {
    const expectedRows = TOOL_DEFINITIONS.reduce(
      (total, t) => total + (t.consequenceClass?.length ?? 0),
      0,
    );
    const section = doc.split(/\n## High-Consequence Tool Matrix\n/)[1]?.split(/\n## /)[0] ?? '';
    const rows = section
      .split('\n')
      .filter((line) => line.trim().startsWith('|'))
      .filter((line) => !line.includes('---'))
      .filter((line) => !line.trim().startsWith('| Tool |'));

    expect(
      rows.length,
      `SECURITY.md's matrix has ${rows.length} rows, registry has ${expectedRows} (tool, consequenceClass) pairs -- run npm run generate:registry`,
    ).toBe(expectedRows);
  });

  it('lists every network-required tool', () => {
    const expected = TOOL_DEFINITIONS.filter((t) => t.network?.required).length;
    const section = doc.split(/\n## Network-Capable Tools\n/)[1]?.split(/\n## /)[0] ?? '';
    const rows = section
      .split('\n')
      .filter((line) => line.trim().startsWith('|'))
      .filter((line) => !line.includes('---'))
      .filter((line) => !line.trim().startsWith('| Tool |'));

    expect(rows.length, 'SECURITY.md\'s network table is stale -- run npm run generate:registry').toBe(
      expected,
    );
  });
});
