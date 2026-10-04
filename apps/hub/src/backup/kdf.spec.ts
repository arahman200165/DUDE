import { describe, expect, it } from 'vitest';
import { DEFAULT_KDF_PARAMS, deriveBackupKey, openBackup, sealBackup } from '@dude/hub-backup';
import { nodeBackupDeps, validateBackupPassphrase } from './kdf.js';

describe('validateBackupPassphrase', () => {
  it('accepts 12 to 256 code points and rejects blank, short and long', () => {
    expect(validateBackupPassphrase('correct horse battery')).toBeNull();
    expect(validateBackupPassphrase('a'.repeat(12))).toBeNull();
    expect(validateBackupPassphrase('a'.repeat(256))).toBeNull();
    expect(validateBackupPassphrase('a'.repeat(11))).toMatch(/at least 12/);
    expect(validateBackupPassphrase('a'.repeat(257))).toMatch(/at most 256/);
    expect(validateBackupPassphrase(' '.repeat(20))).toMatch(/blank/);
  });

  it('counts code points after NFKC normalization', () => {
    expect(validateBackupPassphrase('😀'.repeat(12))).toBeNull();
    expect(validateBackupPassphrase('😀'.repeat(11))).not.toBeNull();
    // Fullwidth letters normalize to one code point each.
    expect(validateBackupPassphrase('ＡＢＣＤＥＦＧＨＩＪＫＬ')).toBeNull();
  });
});

describe('nodeBackupDeps (real Argon2id, library default parameters)', () => {
  it('derives a stable 32-byte key and round-trips a sealed backup', async () => {
    const deps = nodeBackupDeps(() => new Date('2026-10-04T12:00:00Z'));
    const derived = await deriveBackupKey('correct horse battery staple', deps, DEFAULT_KDF_PARAMS);
    expect(derived.key).toHaveLength(32);
    expect(derived.salt).toHaveLength(16);
    expect(deps.now().toISOString()).toBe('2026-10-04T12:00:00.000Z');
    expect(deps.randomBytes(16)).toHaveLength(16);

    const sealed = await sealBackup(
      { files: [{ name: 'a.txt', bytes: new TextEncoder().encode('hello') }], hubVersion: '0.0.0', source: { hubInstanceId: 'i', authorityEpoch: 1, schemaVersion: 1, dbMinReaderVersion: 1 }, forTransfer: false },
      { passphrase: 'correct horse battery staple' },
      deps,
    );
    const opened = await openBackup(sealed, { passphrase: 'correct horse battery staple' }, deps);
    expect(new TextDecoder().decode(opened.files.get('a.txt'))).toBe('hello');
    await expect(openBackup(sealed, { passphrase: 'a different passphrase' }, deps)).rejects.toThrow();
  }, 60_000);
});
