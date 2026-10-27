import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { probeSqliteVec, SQLITE_VEC_DLL_SHA256, SQLITE_VEC_VERSION } from './sqlite-vec.js';

const root = path.resolve(import.meta.dirname, '..', '..', '..', '..');
const vendored = path.join(root, 'build', 'vendor', 'sqlite-vec', 'vec0.dll');

describe('sqlite-vec pin', () => {
  it('matches the fetch script', () => {
    const script = readFileSync(path.join(root, 'scripts', 'fetch-sqlite-vec.mjs'), 'utf8');
    expect(script).toContain(`SQLITE_VEC_VERSION = '${SQLITE_VEC_VERSION}'`);
    expect(script).toContain(`SQLITE_VEC_DLL_SHA256 = '${SQLITE_VEC_DLL_SHA256}'`);
  });
});

describe('probeSqliteVec', () => {
  it('reports a missing library as unavailable, not an error', () => {
    const state = probeSqliteVec(path.join(os.tmpdir(), 'dude-no-such-dir', 'vec0.dll'));
    expect(state.available).toBe(false);
  });

  it('refuses a library whose hash does not match the pin without loading it', () => {
    const dir = mkdtempSync(path.join(os.tmpdir(), 'dude-vec-'));
    try {
      const fake = path.join(dir, 'vec0.dll');
      writeFileSync(fake, 'not a library');
      const state = probeSqliteVec(fake);
      expect(state.available).toBe(false);
      if (!state.available && process.platform === 'win32') expect(state.reason).toMatch(/hash mismatch/);
    } finally { rmSync(dir, { recursive: true, force: true }); }
  });

  it.skipIf(process.platform !== 'win32' || process.arch !== 'x64' || !existsSync(vendored))('loads the pinned library and reports its version', () => {
    const state = probeSqliteVec(vendored);
    expect(state).toMatchObject({ available: true });
    if (state.available) expect(state.version).toContain(SQLITE_VEC_VERSION);
  });
});
