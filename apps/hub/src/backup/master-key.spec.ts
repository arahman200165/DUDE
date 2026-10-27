import { readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { createSecretStore } from '../secrets/secret-store.js';
import type { SyncExec } from '../tls/ca-key-protector.js';
import { tempRoot } from './backup-fixture.js';
import { BACKUP_MASTER_KEY_PURPOSE, createMasterKeyStore, defaultMasterKeyStore } from './master-key.js';

const roots: string[] = [];
afterEach(() => { for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true }); });
const dir = (): string => { const d = tempRoot('masterkey'); roots.push(d); return path.join(d, 'config', 'secrets'); };
const KEY = new Uint8Array(32).map((_, i) => i + 1);

describe('backup master key store (Milestone 847)', () => {
  it('Docker / non-Windows fallback: a mode-0600 file under config/secrets, round trip, presence and clear', () => {
    const secretsDir = dir();
    const keys = defaultMasterKeyStore({ secretsDir }, { platform: 'linux' });
    expect(keys.exists()).toBe(false);
    expect(keys.load()).toBeNull();
    keys.save(KEY);
    expect(keys.exists()).toBe(true);
    expect(readdirSync(secretsDir)).toEqual([`${BACKUP_MASTER_KEY_PURPOSE}.secret`]);
    if (process.platform !== 'win32') expect(statSync(path.join(secretsDir, `${BACKUP_MASTER_KEY_PURPOSE}.secret`)).mode & 0o777).toBe(0o600);
    const loaded = keys.load()!;
    expect(loaded).toEqual(KEY);
    loaded.fill(0);
    expect(keys.load()).toEqual(KEY); // a copy each time
    expect(keys.clear()).toBe(true);
    expect(keys.clear()).toBe(false);
    expect(keys.exists()).toBe(false);
  });

  it('Windows: the key goes to DPAPI through the PowerShell helper on stdin (never argv) with its own entropy', () => {
    const secretsDir = dir();
    const calls: Array<{ args: readonly string[]; input: string }> = [];
    const exec: SyncExec = (_file, args, input) => {
      calls.push({ args, input });
      // A reversible stand-in for CryptProtectData / CryptUnprotectData (the helper exchanges base64 on stdin and stdout).
      return Buffer.from(Buffer.from(input, 'base64').map((b) => b ^ 0x5a)).toString('base64');
    };
    const keys = createMasterKeyStore(createSecretStore({ secretsDir, platform: 'win32', exec }));
    keys.save(KEY);
    expect(readdirSync(secretsDir)).toEqual([`${BACKUP_MASTER_KEY_PURPOSE}.dpapi`]);
    expect(keys.load()).toEqual(KEY);
    const encoded = Buffer.from(KEY).toString('base64url');
    for (const call of calls) {
      expect(call.args.join(' ')).not.toContain(encoded);
      expect(call.args.join(' ')).toContain('DUDE Hub Secret backup.masterKey v1');
    }
    expect(readFileSync(path.join(secretsDir, `${BACKUP_MASTER_KEY_PURPOSE}.dpapi`)).toString('utf8')).not.toContain(encoded);
  });

  it('rejects a wrong-sized key and reports an unreadable or malformed file without its content', () => {
    const secretsDir = dir();
    const keys = defaultMasterKeyStore({ secretsDir }, { platform: 'linux' });
    expect(() => keys.save(new Uint8Array(16))).toThrow(/32 bytes/);
    keys.save(KEY);
    const file = path.join(secretsDir, `${BACKUP_MASTER_KEY_PURPOSE}.secret`);
    for (const bad of ['not json', '{"v":2,"key":"AAAA"}', '{"v":1,"key":"AAAA"}']) {
      writeFileSync(file, bad);
      expect(() => keys.load()).toThrow(/unreadable or corrupt/);
      try { keys.load(); } catch (error) { expect((error as Error).message).not.toContain('AAAA'); }
    }
  });
});
