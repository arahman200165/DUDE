import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { TOOL_DEFINITIONS } from './tool-definitions';
import { PLATFORM_CAPABILITIES, RUNTIMES, platformCapabilities, runtimeCapabilities } from "@dude/contracts/core/platform/capability-catalog";

// Drift check for SECURITY.md's generated tables (scripts/generate-security-doc.mjs,
// DUDE_PRD.md §21 Phase 23 Items 7 & 13) -- mirrors tool-count.spec.ts's README drift check.

function tableRows(section: string): string[] {
  return section
    .split('\n')
    .filter((line) => line.trim().startsWith('|'))
    .filter((line) => !line.includes('---'))
    .filter((line) => !line.trim().startsWith('| Tool |'));
}

describe('SECURITY.md generated tables', () => {
  const securityPath = resolve(process.cwd(), 'SECURITY.md');
  const doc = readFileSync(securityPath, 'utf-8').replace(/\r\n/g, '\n');
  const section = (heading: string) => doc.split(`\n## ${heading}\n`)[1]?.split(/\n## /)[0] ?? '';

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

  it('lists every native/desktop-privileged tool (desktopOpen, secure-local, or a platform capability)', () => {
    const expected = TOOL_DEFINITIONS.filter(
      (t) =>
        t.desktopOpen !== undefined ||
        t.persistence?.input === 'secure-local' ||
        t.persistence?.preferences === 'secure-local' ||
        platformCapabilities(t.capabilities).length > 0,
    ).length;
    expect(tableRows(section('Native/Desktop-Privileged Tools')).length, "SECURITY.md's native table is stale -- run npm run generate:registry").toBe(expected);
  });

  it('has one Web Capability Matrix row per declared capability and runtime', () => {
    const expected = TOOL_DEFINITIONS.reduce(
      (total, t) => total + platformCapabilities(t.capabilities).length + runtimeCapabilities(t.capabilities).length,
      0,
    );
    expect(tableRows(section('Web Capability Matrix')).length, "SECURITY.md's capability matrix is stale -- run npm run generate:registry").toBe(expected);
  });

  it("uses the generator's labels that match capability-catalog.ts", () => {
    const script = readFileSync(resolve(process.cwd(), 'scripts/generate-security-doc.mjs'), 'utf-8');
    for (const [id, info] of Object.entries(PLATFORM_CAPABILITIES)) expect(script).toContain(`'${id}': '${info.label}'`);
    for (const [id, info] of Object.entries(RUNTIMES)) expect(script).toContain(`${id}: '${info.label}'`);
  });

  it("mirrors the capability matrix into README.md's fenced block", () => {
    const readme = readFileSync(resolve(process.cwd(), 'README.md'), 'utf-8').replace(/\r\n/g, '\n');
    const block = readme.split('<!-- capability-matrix:start -->')[1]?.split('<!-- capability-matrix:end -->')[0] ?? '';
    expect(block.trim(), 'README capability matrix is stale -- run npm run generate:registry').toBe(section('Web Capability Matrix').trim());
  });
});
