import { mkdtempSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { lockExtensionLoading, openSqliteDatabase } from './open.js';

const dirs: string[] = [];
const tempDb = (): string => {
  const d = mkdtempSync(path.join(os.tmpdir(), 'dude-sqlite-open-'));
  dirs.push(d);
  return path.join(d, 'test.db');
};
afterEach(() => { for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true }); });

// A path that cannot exist: the call must fail in SQLite's loader (extension loading enabled) rather than be refused up front.
const missingLibrary = path.join(os.tmpdir(), 'dude-no-such-extension-library');

describe('openSqliteDatabase extension loading', () => {
  it('refuses loadExtension by default', () => {
    const db = openSqliteDatabase(tempDb());
    try {
      expect(() => db.loadExtension(missingLibrary)).toThrow(/extension/i);
    } finally { db.close(); }
  });

  it('allows loadExtension when allowExtension is set, then locks it again', () => {
    const db = openSqliteDatabase(tempDb(), { allowExtension: true });
    try {
      let enabledError = '';
      try { db.loadExtension(missingLibrary); } catch (error) { enabledError = (error as Error).message; }
      expect(enabledError).not.toBe('');
      expect(enabledError).not.toMatch(/extension loading is not enabled|not allowed/i);

      lockExtensionLoading(db);
      expect(() => db.loadExtension(missingLibrary)).toThrow(/extension/i);
    } finally { db.close(); }
  });
});
