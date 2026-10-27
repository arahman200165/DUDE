import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { createSecretStore } from '../../../secrets/secret-store.js';
import type { SecretStore } from '../../../secrets/secret-store.js';
import { S3_CREDENTIALS_PURPOSE, createS3CredentialStore, defaultS3CredentialStore, validateS3Credentials } from './s3-credentials.js';

const roots: string[] = [];
afterEach(() => { for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true }); });
const dir = (): string => { const d = mkdtempSync(path.join(os.tmpdir(), 'dude-hub-s3cred-')); roots.push(d); return d; };
/** The file-protected store (platform pinned off win32 so no PowerShell is involved). */
const fileStore = (secretsDir: string): SecretStore => createSecretStore({ secretsDir, platform: 'linux' });
const blobPath = (folder: string): string => path.join(folder, `${S3_CREDENTIALS_PURPOSE}.secret`);

const SECRET = 'wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY';
const KEY_ID = 'AKIAIOSFODNN7EXAMPLE';
const TOKEN = 'FwoGZXIvYXdzEXAMPLESESSIONTOKEN';
const CREDS = { accessKeyId: KEY_ID, secretAccessKey: SECRET };

type StoreLike = Pick<SecretStore, 'get' | 'put' | 'delete' | 'status'>;

/** A secret store stub that holds one fixed value for the credentials purpose (or none). */
function fakeSecrets(value: Buffer | null): StoreLike {
  let current = value;
  return {
    get: () => current,
    put: (_purpose, next) => { current = Buffer.from(next as string); },
    delete: () => { const had = current !== null; current = null; return had; },
    status: () => new Proxy({}, { get: () => ({ present: current !== null, needsReentry: false }) }) as ReturnType<SecretStore['status']>,
  };
}

describe('validateS3Credentials', () => {
  it('accepts an access key and secret, and an optional session token', () => {
    expect(validateS3Credentials(CREDS)).toEqual(CREDS);
    expect(validateS3Credentials({ ...CREDS, sessionToken: TOKEN })).toEqual({ ...CREDS, sessionToken: TOKEN });
  });

  it('refuses a non-object, an unknown field, a missing or oversized field and whitespace or non-ASCII characters', () => {
    for (const bad of [null, undefined, 'x', 1, [], [CREDS]]) expect(typeof validateS3Credentials(bad)).toBe('string');
    expect(validateS3Credentials({ ...CREDS, extra: 'x' })).toMatch(/unknown field/);
    expect(validateS3Credentials({ secretAccessKey: SECRET })).toMatch(/accessKeyId/);
    expect(validateS3Credentials({ accessKeyId: KEY_ID })).toMatch(/secretAccessKey/);
    expect(validateS3Credentials({ ...CREDS, accessKeyId: '' })).toMatch(/accessKeyId/);
    expect(validateS3Credentials({ ...CREDS, accessKeyId: 'has space' })).toMatch(/accessKeyId/);
    expect(validateS3Credentials({ ...CREDS, accessKeyId: 'a'.repeat(129) })).toMatch(/accessKeyId/);
    expect(validateS3Credentials({ ...CREDS, accessKeyId: 'a'.repeat(128) })).toEqual({ ...CREDS, accessKeyId: 'a'.repeat(128) });
    expect(validateS3Credentials({ ...CREDS, secretAccessKey: 'new\nline' })).toMatch(/secretAccessKey/);
    expect(validateS3Credentials({ ...CREDS, secretAccessKey: 'é' })).toMatch(/secretAccessKey/);
    expect(validateS3Credentials({ ...CREDS, secretAccessKey: 's'.repeat(257) })).toMatch(/secretAccessKey/);
    expect(validateS3Credentials({ ...CREDS, sessionToken: '' })).toMatch(/sessionToken/);
    expect(validateS3Credentials({ ...CREDS, sessionToken: 5 })).toMatch(/sessionToken/);
    expect(validateS3Credentials({ ...CREDS, sessionToken: 't'.repeat(4097) })).toMatch(/sessionToken/);
  });

  it('never echoes a rejected value in its message', () => {
    const message = validateS3Credentials({ accessKeyId: KEY_ID, secretAccessKey: `${SECRET} with space` });
    expect(typeof message).toBe('string');
    expect(message).not.toContain(SECRET);
    expect(message).not.toContain(KEY_ID);
  });
});

describe('the protected S3 credential store', () => {
  it('round-trips through the secret store under ONE purpose, keyed by destination id', () => {
    const folder = dir();
    const store = createS3CredentialStore(fileStore(folder));
    expect(store.has('s3-a')).toBe(false);
    expect(store.get('s3-a')).toBeNull();
    store.put('s3-a', CREDS);
    store.put('s3-b', { ...CREDS, accessKeyId: 'AKIAOTHER', sessionToken: TOKEN });
    expect(store.has('s3-a')).toBe(true);
    expect(store.get('s3-a')).toEqual(CREDS);
    expect(store.get('s3-b')).toEqual({ ...CREDS, accessKeyId: 'AKIAOTHER', sessionToken: TOKEN });
    expect(store.get('s3-c')).toBeNull();
    expect(store.has('s3-c')).toBe(false);
    expect(readdirSync(folder)).toEqual([`${S3_CREDENTIALS_PURPOSE}.secret`]);
    // A fresh store over the same directory (a Hub restart) sees the same credentials.
    expect(createS3CredentialStore(fileStore(folder)).get('s3-b')?.sessionToken).toBe(TOKEN);
  });

  it('replaces an entry, and deletes one; the purpose goes away with the last entry', () => {
    const folder = dir();
    const store = createS3CredentialStore(fileStore(folder));
    store.put('s3-a', CREDS);
    store.put('s3-b', CREDS);
    store.put('s3-a', { ...CREDS, secretAccessKey: 'replaced-secret' });
    expect(store.get('s3-a')?.secretAccessKey).toBe('replaced-secret');
    expect(store.delete('s3-a')).toBe(true);
    expect(store.delete('s3-a')).toBe(false);
    expect(store.get('s3-b')).toEqual(CREDS);
    expect(existsSync(blobPath(folder))).toBe(true);
    expect(store.delete('s3-b')).toBe(true);
    expect(existsSync(blobPath(folder))).toBe(false);
    expect(store.has('s3-b')).toBe(false);
  });

  it('refuses to store invalid credentials and writes nothing', () => {
    const folder = dir();
    const store = createS3CredentialStore(fileStore(folder));
    expect(() => store.put('s3-a', { accessKeyId: '', secretAccessKey: SECRET })).toThrow(/Invalid S3 credentials/);
    expect(() => store.put('s3-a', { ...CREDS, extra: 1 } as never)).toThrow(/Invalid S3 credentials/);
    expect(existsSync(blobPath(folder))).toBe(false);
  });

  it('keeps the whole map as one versioned blob in the secret store', () => {
    const secrets = fileStore(dir());
    createS3CredentialStore(secrets).put('s3-a', CREDS);
    const parsed = JSON.parse((secrets.get(S3_CREDENTIALS_PURPOSE) as Buffer).toString('utf8')) as { v: number; credentials: Record<string, unknown> };
    expect(parsed.v).toBe(1);
    expect(Object.keys(parsed.credentials)).toEqual(['s3-a']);
  });

  it('reports a corrupt or unreadable stored map with a value-free error', () => {
    const cases: Array<[string, () => StoreLike]> = [
      ['not json', () => fakeSecrets(Buffer.from(`not json ${SECRET}`))],
      ['wrong version', () => fakeSecrets(Buffer.from(JSON.stringify({ v: 2, credentials: {} })))],
      ['credentials not an object', () => fakeSecrets(Buffer.from(JSON.stringify({ v: 1, credentials: [] })))],
      ['an invalid entry', () => fakeSecrets(Buffer.from(JSON.stringify({ v: 1, credentials: { a: { accessKeyId: KEY_ID, secretAccessKey: `${SECRET} bad` } } })))],
      ['the secret store itself failing', () => ({ ...fakeSecrets(null), get: () => { throw new Error(`DPAPI says ${SECRET}`); } })],
    ];
    for (const [label, make] of cases) {
      const store = createS3CredentialStore(make());
      for (const call of [() => store.get('a'), () => store.put('b', CREDS), () => store.delete('a')]) {
        try { call(); expect.unreachable(label); } catch (error) {
          expect((error as Error).message, label).toMatch(/unreadable or corrupt/);
          expect((error as Error).message, label).not.toContain(SECRET);
          expect((error as Error).message, label).not.toContain(KEY_ID);
        }
      }
    }
  });

  it('zeroes the buffer it read from the secret store', () => {
    const raw = Buffer.from(JSON.stringify({ v: 1, credentials: { a: CREDS } }));
    const store = createS3CredentialStore(fakeSecrets(raw));
    expect(store.get('a')).toEqual(CREDS);
    expect(raw.every((byte) => byte === 0)).toBe(true);
  });

  it('keeps credential values out of file names, and `has` answers presence only', () => {
    const folder = dir();
    const store = createS3CredentialStore(fileStore(folder));
    store.put('s3-a', { ...CREDS, sessionToken: TOKEN });
    expect(store.has('s3-a')).toBe(true);
    for (const name of readdirSync(folder)) expect(name).not.toContain(KEY_ID);
  });

  it('defaultS3CredentialStore builds the production store under the secrets directory', () => {
    const folder = dir();
    const store = defaultS3CredentialStore({ secretsDir: folder }, { platform: 'linux' });
    store.put('s3-a', CREDS);
    expect(readFileSync(blobPath(folder)).length).toBeGreaterThan(0);
    expect(store.get('s3-a')).toEqual(CREDS);
  });
});
