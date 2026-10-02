import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import { readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import type { Db } from '@dude/sqlite-store';

export const SETUP_TOKEN_FILE = 'setup-token';
export const setupTokenFile = (configDir: string): string => path.join(configDir, SETUP_TOKEN_FILE);

const sha256Hex = (value: string): string => createHash('sha256').update(value).digest('hex');

interface SetupRow { token_hash: string; consumed_at: string | null }

const readRow = (db: Db): SetupRow | undefined => db.prepare('SELECT token_hash, consumed_at FROM setup_state WHERE id = 1').get() as SetupRow | undefined;

function readFileToken(file: string): string | null {
  try {
    return readFileSync(file, 'utf8').trim();
  } catch {
    return null;
  }
}

/**
 * While no owner exists, makes sure a one-time setup token is stored (as a hash) and written to
 * `<configDir>/setup-token`. The file is created 0600 on POSIX; on Windows the service installer applies the
 * ACL in a later milestone. An existing file whose hash matches an unconsumed row is kept. Returns the token,
 * or null when the Hub is already bootstrapped.
 */
export function ensureSetupToken(db: Db, configDir: string, now: number): string | null {
  const file = setupTokenFile(configDir);
  if (db.prepare('SELECT 1 AS x FROM owner LIMIT 1').get() !== undefined) {
    rmSync(file, { force: true });
    return null;
  }
  const row = readRow(db);
  const existing = readFileToken(file);
  if (row && row.consumed_at === null && existing && sha256Hex(existing) === row.token_hash) return existing;

  const token = randomBytes(32).toString('base64url');
  const temp = `${file}.tmp`;
  writeFileSync(temp, `${token}\n`, { mode: 0o600 });
  renameSync(temp, file);
  db.prepare(
    `INSERT INTO setup_state(id, token_hash, created_at, consumed_at) VALUES(1, ?, ?, NULL)
     ON CONFLICT(id) DO UPDATE SET token_hash = excluded.token_hash, created_at = excluded.created_at, consumed_at = NULL`,
  ).run(sha256Hex(token), new Date(now).toISOString());
  return token;
}

/** Constant-time comparison of the candidate's hash with the stored hash; false once consumed. */
export function verifySetupToken(db: Db, candidate: string): boolean {
  const row = readRow(db);
  const given = Buffer.from(sha256Hex(candidate), 'hex');
  const stored = Buffer.from(row?.token_hash ?? '00'.repeat(32), 'hex');
  const equal = given.length === stored.length && timingSafeEqual(given, stored);
  return equal && row !== undefined && row.consumed_at === null;
}

export function consumeSetupToken(db: Db, now: number): void {
  db.prepare('UPDATE setup_state SET consumed_at = ? WHERE id = 1 AND consumed_at IS NULL').run(new Date(now).toISOString());
}

export function deleteSetupTokenFile(configDir: string): void {
  rmSync(setupTokenFile(configDir), { force: true });
}
