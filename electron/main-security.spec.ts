import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

// Regression guard for electron/AGENTS.md's one rule: contextIsolation: true, nodeIntegration:
// false, and sandbox: true, with no exceptions (DUDE_PRD.md §21 Phase 23 Item 9). A text-based
// check over the real source, not a mocked import -- main.ts pulls in the real 'electron'
// module plus every IPC bridge at module scope, so actually constructing a BrowserWindow here
// would mean mocking the whole module graph for very little extra safety over reading the one
// object literal that matters. Mirrors the regex-extraction style already used by
// scripts/generate-security-doc.mjs for the same "cheap, real check over source text" tradeoff.

describe('BrowserWindow security preferences', () => {
  const mainSource = readFileSync(resolve(__dirname, 'main.ts'), 'utf-8');

  it('never constructs a BrowserWindow without the three required webPreferences flags', () => {
    const webPreferencesBlocks = [...mainSource.matchAll(/webPreferences:\s*\{([^}]*)\}/g)];
    expect(webPreferencesBlocks.length, 'main.ts should construct at least one BrowserWindow').toBeGreaterThan(0);

    for (const [, block] of webPreferencesBlocks) {
      expect(block, 'webPreferences must set contextIsolation: true').toMatch(/contextIsolation:\s*true/);
      expect(block, 'webPreferences must set nodeIntegration: false').toMatch(/nodeIntegration:\s*false/);
      expect(block, 'webPreferences must set sandbox: true').toMatch(/sandbox:\s*true/);
    }
  });
});
