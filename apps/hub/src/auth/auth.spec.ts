import { existsSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { tempDir } from '../server/test-helpers.js';
import { ensureLayout } from '../config/data-dir.js';
import { openHubDb } from '../db/open-hub-db.js';
import { DEFAULT_PASSWORD_PARAMS, hashPassword, validateOwnerPassword, verifyPassword } from './password.js';
import type { PasswordParams } from './password.js';
import { consumeRecoveryCode, normalizeRecoveryCode, replaceRecoveryCodes } from './recovery-codes.js';
import { consumeSetupToken, ensureSetupToken, setupTokenFile, verifySetupToken } from './setup-token.js';

const CHEAP: PasswordParams = { v: 1, m: 64, t: 1, p: 1, len: 32 };

function openDb() {
  const paths = ensureLayout(tempDir('hub-auth-'));
  const opened = openHubDb({ dbFile: paths.dbFile, preMigrationDir: paths.preMigrationDir });
  if (opened.status !== 'ready') throw new Error('not ready');
  return { paths, hub: opened.hub, db: opened.hub.db };
}

function seedOwner(db: ReturnType<typeof openDb>['db']): string {
  const at = new Date(0).toISOString();
  db.prepare('INSERT INTO environment(environment_id, display_name, created_at) VALUES(?, ?, ?)').run('env', 'E', at);
  db.prepare('INSERT INTO owner(owner_id, environment_id, display_name, created_at) VALUES(?, ?, ?, ?)').run('owner', 'env', 'O', at);
  return 'owner';
}

describe('password', () => {
  it('round-trips with the production parameters and rejects a wrong password', async () => {
    const stored = await hashPassword('correct horse battery');
    expect(JSON.parse(stored.paramsJson)).toEqual(DEFAULT_PASSWORD_PARAMS);
    expect(stored.salt.length).toBe(16);
    expect(stored.hash.length).toBe(32);
    expect(await verifyPassword('correct horse battery', stored)).toBe(true);
    expect(await verifyPassword('correct horse batterz', stored)).toBe(false);
  }, 20_000);

  it('verifies with the parameters stored alongside the hash, and salts every hash', async () => {
    const a = await hashPassword('a long enough password', CHEAP);
    const b = await hashPassword('a long enough password', CHEAP);
    expect(JSON.parse(a.paramsJson)).toEqual(CHEAP);
    expect(a.hash.equals(b.hash)).toBe(false);
    expect(await verifyPassword('a long enough password', a)).toBe(true);
    expect(await verifyPassword('a long enough password', { ...a, paramsJson: 'garbage' })).toBe(false);
  });

  it('normalizes with NFKC before hashing', async () => {
    const stored = await hashPassword('ｐａｓｓｗｏｒｄ１２３４５', CHEAP); // full-width
    expect(await verifyPassword('password12345', stored)).toBe(true);
  });

  it('enforces the policy with typed reasons', () => {
    expect(validateOwnerPassword('short')).toEqual({ ok: false, reason: 'too-short' });
    expect(validateOwnerPassword(' '.repeat(20))).toEqual({ ok: false, reason: 'blank' });
    expect(validateOwnerPassword('x'.repeat(257))).toEqual({ ok: false, reason: 'too-long' });
    expect(validateOwnerPassword('x'.repeat(256))).toEqual({ ok: true });
    expect(validateOwnerPassword('x'.repeat(12))).toEqual({ ok: true });
    expect(validateOwnerPassword('😀'.repeat(12))).toEqual({ ok: true }); // code points, not UTF-16 units
    expect(validateOwnerPassword('😀'.repeat(11))).toEqual({ ok: false, reason: 'too-short' });
  });
});

describe('recovery codes', () => {
  it('generates ten distinct codes in the XXXXX-XXXXX format and stores only hashes', () => {
    const { db, hub } = openDb();
    const owner = seedOwner(db);
    const codes = replaceRecoveryCodes(db, owner, 1000);
    expect(codes).toHaveLength(10);
    expect(new Set(codes).size).toBe(10);
    for (const code of codes) expect(code).toMatch(/^[0-9A-HJKMNP-TV-Z]{5}-[0-9A-HJKMNP-TV-Z]{5}$/);
    const rows = db.prepare('SELECT code_hash, generation FROM recovery_codes').all() as { code_hash: string; generation: number }[];
    expect(rows).toHaveLength(10);
    expect(rows.every((r) => r.generation === 1)).toBe(true);
    expect(rows.map((r) => r.code_hash)).toContain(createHash('sha256').update(codes[0]!.replace('-', '')).digest('hex'));
    expect(JSON.stringify(rows)).not.toContain(codes[0]!);
    hub.close();
  });

  it('normalizes input', () => {
    expect(normalizeRecoveryCode(' ab-cde  fgh-jk ')).toBe('ABCDEFGHJK');
    expect(normalizeRecoveryCode('o0Il-1')).toBe('00111');
  });

  it('consumes a code once, accepting sloppy input', () => {
    const { db, hub } = openDb();
    const owner = seedOwner(db);
    const codes = replaceRecoveryCodes(db, owner, 1000);
    const sloppy = codes[0]!.toLowerCase().replace('-', ' ');
    expect(consumeRecoveryCode(db, owner, sloppy, 2000)).toBe(true);
    expect(consumeRecoveryCode(db, owner, codes[0]!, 3000)).toBe(false);
    expect(consumeRecoveryCode(db, owner, 'AAAAA-AAAAA', 3000)).toBe(false);
    expect(consumeRecoveryCode(db, 'someone-else', codes[1]!, 3000)).toBe(false);
    expect(consumeRecoveryCode(db, owner, codes[1]!, 3000)).toBe(true);
    hub.close();
  });

  it('regeneration invalidates the old set', () => {
    const { db, hub } = openDb();
    const owner = seedOwner(db);
    const first = replaceRecoveryCodes(db, owner, 1000);
    const second = replaceRecoveryCodes(db, owner, 2000);
    expect(db.prepare('SELECT COUNT(*) AS n FROM recovery_codes').get()).toEqual({ n: 10 });
    expect(db.prepare('SELECT DISTINCT generation AS g FROM recovery_codes').all().map((r) => ({ ...r }))).toEqual([{ g: 2 }]);
    expect(consumeRecoveryCode(db, owner, first[0]!, 3000)).toBe(false);
    expect(consumeRecoveryCode(db, owner, second[0]!, 3000)).toBe(true);
    hub.close();
  });
});

describe('setup token', () => {
  it('creates a token, persists it across restarts and verifies it', () => {
    const { db, paths, hub } = openDb();
    const token = ensureSetupToken(db, paths.configDir, 1000)!;
    expect(token).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(readFileSync(setupTokenFile(paths.configDir), 'utf8').trim()).toBe(token);
    expect({ ...(db.prepare('SELECT token_hash FROM setup_state WHERE id = 1').get() as object) }).toEqual({
      token_hash: createHash('sha256').update(token).digest('hex'),
    });
    expect(ensureSetupToken(db, paths.configDir, 2000)).toBe(token); // restart keeps it
    expect(verifySetupToken(db, token)).toBe(true);
    expect(verifySetupToken(db, `${token.slice(0, 42)}${token.endsWith('A') ? 'B' : 'A'}`)).toBe(false);
    expect(verifySetupToken(db, '')).toBe(false);
    hub.close();
  });

  it('rotates when the file is gone or no longer matches', () => {
    const { db, paths, hub } = openDb();
    const first = ensureSetupToken(db, paths.configDir, 1000)!;
    rmSync(setupTokenFile(paths.configDir));
    const second = ensureSetupToken(db, paths.configDir, 2000)!;
    expect(second).not.toBe(first);
    expect(verifySetupToken(db, first)).toBe(false);
    expect(verifySetupToken(db, second)).toBe(true);
    writeFileSync(setupTokenFile(paths.configDir), 'tampered\n');
    expect(ensureSetupToken(db, paths.configDir, 3000)).not.toBe(second);
    hub.close();
  });

  it('is consumed once and issues nothing when an owner exists', () => {
    const { db, paths, hub } = openDb();
    const token = ensureSetupToken(db, paths.configDir, 1000)!;
    consumeSetupToken(db, 2000);
    expect(verifySetupToken(db, token)).toBe(false);
    seedOwner(db);
    expect(ensureSetupToken(db, paths.configDir, 3000)).toBeNull();
    expect(existsSync(setupTokenFile(paths.configDir))).toBe(false);
    hub.close();
  });
});
