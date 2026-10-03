import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { TOOL_DEFINITIONS } from './tool-definitions';

describe('README tool count', () => {
  const readmePath = resolve(process.cwd(), 'README.md');
  // Normalize CRLF -> LF: git checks this file out with CRLF line endings on Windows runners
  // (e.g. ci.yml's windows-latest release job), which would otherwise break the bare `\n` splits below.
  const readme = readFileSync(readmePath, 'utf-8').replace(/\r\n/g, '\n');

  const showcaseToolCount = TOOL_DEFINITIONS.length;

  it('matches the showcase tool count in the "N tools ship today" line', () => {
    const match = readme.match(/(\d+) tools ship today/);
    expect(match, 'README.md should contain an "N tools ship today" line').not.toBeNull();

    const statedCount = Number(match![1]);
    expect(
      statedCount,
      `README says ${statedCount} tools, registry has ${showcaseToolCount} tools -- update README.md's "tools ship today" line`,
    ).toBe(showcaseToolCount);
  });

  it('has one Tools table row per registered tool', () => {
    const toolsSection = readme.split(/\n## Tools\n/)[1]?.split(/\n## Architecture\n/)[0] ?? '';
    const rows = toolsSection
      .split('\n')
      .filter((line) => line.trim().startsWith('|'))
      .filter((line) => !line.includes('---'))
      .filter((line) => !line.trim().startsWith('| Tool |'));

    expect(
      rows.length,
      `README's Tools table has ${rows.length} rows, registry has ${showcaseToolCount} tools -- they should match`,
    ).toBe(showcaseToolCount);
  });
});

describe('Universal I/O contract coverage', () => {
  it('declares a non-empty io.accepts and io.produces for every tool', () => {
    for (const definition of TOOL_DEFINITIONS) {
      expect(definition.io?.accepts.length, `${definition.id} is missing io.accepts`).toBeGreaterThan(0);
      expect(definition.io?.produces.length, `${definition.id} is missing io.produces`).toBeGreaterThan(0);
    }
  });
});
