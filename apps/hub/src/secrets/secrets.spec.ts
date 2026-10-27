import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { openBackup } from '@dude/hub-backup';
import { cheapDeps, openFixtureHub, seedHubDb, tempRoot } from '../backup/backup-fixture.js';
import { createBackupFile } from '../backup/create-backup.js';
import { ACME_DPAPI_ENTROPY, DPAPI_ENTROPY } from '../tls/ca-key-protector.js';
import type { SyncExec } from '../tls/ca-key-protector.js';
import { BACKUP_SCHEDULE_DPAPI_ENTROPY } from '../backup/schedule-key.js';
import { HUB_SECRET_PURPOSES, createSecretStore, isHubSecretPurpose, secretEntropy } from './secret-store.js';
import type { HubSecretPurpose } from './secret-store.js';

const roots: string[] = [];
const dir = (): string => {
  const root = tempRoot('secrets');
  roots.push(root);
  return path.join(root, 'config', 'secrets');
};
afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

const VALUE = 'cf-connector-token-9f2c7e1a-NOT-A-REAL-TOKEN';

/**
 * Stand-in for the PowerShell DPAPI call that models the entropy: the blob starts with a hash of the entropy and Unprotect fails
 * unless the entropy matches, which is what real DPAPI does. Reads the same script the real helper runs.
 */
const fakeDpapi: SyncExec = (_file, args, input) => {
  const script = args[args.length - 1]!;
  const entropy = /GetBytes\('([^']*)'\)/.exec(script)![1]!;
  const tag = createHash('sha256').update(entropy).digest();
  const data = Buffer.from(input.trim(), 'base64');
  if (script.includes('::Protect(')) return Buffer.concat([tag, Buffer.from(data.map((b) => b ^ 0x5a))]).toString('base64');
  if (!data.subarray(0, 32).equals(tag)) throw new Error('powershell.exe exited with code 1: The data is invalid.');
  return Buffer.from(data.subarray(32).map((b) => b ^ 0x5a)).toString('base64');
};

const winStore = (secretsDir: string) => createSecretStore({ secretsDir, platform: 'win32', exec: fakeDpapi });
const linuxStore = (secretsDir: string) => createSecretStore({ secretsDir, platform: 'linux' });

describe('secret purposes', () => {
  it('are a closed list with a distinct DPAPI entropy each, none shared with the CA, ACME or backup-schedule keys', () => {
    expect(HUB_SECRET_PURPOSES).toEqual(['tunnel.connectorToken', 'oidc.clientSecret', 'backup.s3.credentials', 'backup.drive.refreshToken', 'backup.onedrive.refreshToken']);
    const entropies = [...HUB_SECRET_PURPOSES.map(secretEntropy), DPAPI_ENTROPY, ACME_DPAPI_ENTROPY, BACKUP_SCHEDULE_DPAPI_ENTROPY];
    expect(new Set(entropies).size).toBe(entropies.length);
    for (const entropy of entropies) expect(entropy).not.toMatch(/'/);
  });

  it('rejects an unknown purpose before touching the disk', () => {
    const d = dir();
    const store = winStore(d);
    const bad = 'tunnel.apiToken' as HubSecretPurpose;
    expect(isHubSecretPurpose(bad)).toBe(false);
    expect(() => { store.put(bad, VALUE); }).toThrow('Unknown secret purpose.');
    expect(() => store.get(bad)).toThrow('Unknown secret purpose.');
    expect(() => store.delete(bad)).toThrow('Unknown secret purpose.');
    expect(() => store.get('../../hub' as HubSecretPurpose)).toThrow('Unknown secret purpose.');
    expect(existsSync(d)).toBe(false);
  });
});

describe.each([
  ['DPAPI path (faked PowerShell)', winStore],
  ['file fallback path', linuxStore],
] as const)('secret store, %s', (_label, make) => {
  it('round-trips text and bytes, overwrites, and deletes', () => {
    const store = make(dir());
    expect(store.get('tunnel.connectorToken')).toBeNull();
    store.put('tunnel.connectorToken', VALUE);
    expect(store.getText('tunnel.connectorToken')).toBe(VALUE);
    const bytes = new Uint8Array([0, 255, 1, 254, 128]);
    store.put('backup.s3.credentials', bytes);
    expect([...store.get('backup.s3.credentials')!]).toEqual([...bytes]);
    store.put('tunnel.connectorToken', 'second');
    expect(store.getText('tunnel.connectorToken')).toBe('second');
    expect(store.delete('tunnel.connectorToken')).toBe(true);
    expect(store.delete('tunnel.connectorToken')).toBe(false);
    expect(store.get('tunnel.connectorToken')).toBeNull();
    expect(store.getText('backup.s3.credentials')).not.toBeNull();
  });

  it('refuses an empty or oversized value', () => {
    const store = make(dir());
    expect(() => { store.put('oidc.clientSecret', ''); }).toThrow(/empty/);
    expect(() => { store.put('oidc.clientSecret', new Uint8Array(64 * 1024 + 1)); }).toThrow(/at most/);
    expect(store.status()['oidc.clientSecret'].present).toBe(false);
  });

  it('reports presence only, and needsReentry for an expected purpose that is absent', () => {
    const store = make(dir());
    store.put('oidc.clientSecret', VALUE);
    const status = store.status({ expected: ['oidc.clientSecret', 'tunnel.connectorToken'] });
    expect(Object.keys(status)).toEqual([...HUB_SECRET_PURPOSES]);
    expect(status['oidc.clientSecret']).toEqual({ present: true, needsReentry: false });
    expect(status['tunnel.connectorToken']).toEqual({ present: false, needsReentry: true });
    expect(status['backup.s3.credentials']).toEqual({ present: false, needsReentry: false });
    expect(JSON.stringify(status)).not.toContain(VALUE);
  });

  it('writes atomically: no .part file remains after a write', () => {
    const d = dir();
    const store = make(d);
    store.put('backup.drive.refreshToken', 'first');
    expect(readdirSync(d)).toHaveLength(1);
    expect(readdirSync(d).filter((n) => n.endsWith('.part'))).toEqual([]);
  });

  it('cleans up the part file and keeps the target when the final rename fails', () => {
    const d = dir();
    const store = make(d);
    const target = path.join(d, store.kind === 'dpapi' ? 'oidc.clientSecret.dpapi' : 'oidc.clientSecret.secret');
    // A directory where the file belongs makes the rename fail after the part file was written.
    mkdirSync(target, { recursive: true });
    expect(() => { store.put('oidc.clientSecret', VALUE); }).toThrow();
    expect(readdirSync(d)).toEqual([path.basename(target)]);
  });
});

describe('a failed protect', () => {
  it('writes nothing, keeps the previous value and never puts the value or the helper output in the error', () => {
    const d = dir();
    winStore(d).put('backup.drive.refreshToken', 'first');
    const failing = createSecretStore({ secretsDir: d, platform: 'win32', exec: () => { throw new Error(`boom ${VALUE}`); } });
    let message = '';
    try { failing.put('backup.drive.refreshToken', VALUE); } catch (e) { message = (e as Error).message; }
    expect(message).toContain('could not be protected');
    expect(message).not.toContain(VALUE);
    expect(readdirSync(d)).toEqual(['backup.drive.refreshToken.dpapi']);
    expect(winStore(d).getText('backup.drive.refreshToken')).toBe('first');
  });
});

describe('purpose isolation', () => {
  it('a blob protected for one purpose cannot be read as another, and the error carries no value', () => {
    const d = dir();
    const store = winStore(d);
    store.put('tunnel.connectorToken', VALUE);
    writeFileSync(path.join(d, 'oidc.clientSecret.dpapi'), readFileSync(path.join(d, 'tunnel.connectorToken.dpapi')));
    let message = '';
    try { store.get('oidc.clientSecret'); } catch (e) { message = (e as Error).message; }
    expect(message).toContain('enter it again');
    expect(message).not.toContain(VALUE);
    expect(message).not.toContain('The data is invalid');
    expect(store.getText('tunnel.connectorToken')).toBe(VALUE);
  });

  it('keeps a per-purpose file name and mode-0600 (POSIX) on disk', () => {
    const d = dir();
    const store = linuxStore(d);
    store.put('backup.onedrive.refreshToken', VALUE);
    expect(readdirSync(d)).toEqual(['backup.onedrive.refreshToken.secret']);
    if (process.platform !== 'win32') {
      expect(statSync(path.join(d, 'backup.onedrive.refreshToken.secret')).mode & 0o777).toBe(0o600);
      expect(statSync(d).mode & 0o777).toBe(0o700);
    }
  });
});

describe.skipIf(process.platform !== 'win32')('Windows DPAPI (real PowerShell, LocalMachine)', () => {
  it('round-trips, stores no plaintext, and does not unprotect under another purpose', () => {
    const d = dir();
    const store = createSecretStore({ secretsDir: d });
    expect(store.kind).toBe('dpapi');
    store.put('tunnel.connectorToken', VALUE);
    const file = path.join(d, 'tunnel.connectorToken.dpapi');
    const blob = readFileSync(file);
    expect(blob.includes(Buffer.from(VALUE))).toBe(false);
    expect(blob.includes(Buffer.from(VALUE).toString('base64'))).toBe(false);
    expect(blob.toString('utf8')).not.toContain('NOT-A-REAL-TOKEN');
    expect(store.getText('tunnel.connectorToken')).toBe(VALUE);
    writeFileSync(path.join(d, 'oidc.clientSecret.dpapi'), blob);
    expect(() => store.get('oidc.clientSecret')).toThrow(/enter it again/);
  }, 60_000);
});

describe('backups never contain secrets', () => {
  it('a backup of a Hub with stored secrets holds only dude.db and hub.json, and neither carries a secret', async () => {
    const root = tempRoot('secrets-backup');
    roots.push(root);
    const { hub, paths } = openFixtureHub(root);
    try {
      seedHubDb(hub.db);
      mkdirSync(paths.configDir, { recursive: true });
      writeFileSync(paths.configFile, '{"exposure":{"mode":"private"}}\n');
      expect(paths.secretsDir).toBe(path.join(paths.configDir, 'secrets'));
      linuxStore(paths.secretsDir).put('tunnel.connectorToken', VALUE);
      const deps = cheapDeps();
      const created = await createBackupFile({
        db: hub.db, paths, hubVersion: '1.2.3', hubInstanceId: hub.hubInstanceId, authorityEpoch: 3, forTransfer: false,
        targetDir: path.join(root, 'out'), credential: { passphrase: 'a long enough passphrase' }, deps, workDir: path.join(root, 'work'),
      });
      expect(created.manifest.files.map((f) => f.name)).toEqual(['dude.db', 'hub.json']);
      const opened = await openBackup(new Uint8Array(readFileSync(created.file)), { passphrase: 'a long enough passphrase' }, deps);
      for (const content of opened.files.values()) expect(Buffer.from(content).includes(Buffer.from(VALUE))).toBe(false);
      expect(linuxStore(paths.secretsDir).getText('tunnel.connectorToken')).toBe(VALUE);
    } finally {
      hub.close();
    }
  });
});

describe('secret store import boundary', () => {
  const srcRoot = path.join(__dirname, '..');
  const sources = (): Array<{ rel: string; text: string }> => {
    const found: Array<{ rel: string; text: string }> = [];
    const walk = (current: string): void => {
      for (const entry of readdirSync(current, { withFileTypes: true })) {
        const full = path.join(current, entry.name);
        if (entry.isDirectory()) walk(full);
        else if (entry.name.endsWith('.ts') && !entry.name.endsWith('.spec.ts')) {
          found.push({ rel: path.relative(srcRoot, full).replace(/\\/g, '/'), text: readFileSync(full, 'utf8') });
        }
      }
    };
    walk(srcRoot);
    return found;
  };
  const outside = (pattern: RegExp): string[] =>
    sources().filter((s) => !s.rel.startsWith('secrets/') && pattern.test(s.text)).map((s) => s.rel).sort();

  it('no module outside secrets/ imports the store yet; each later importer is added here deliberately (never a request handler)', () => {
    const allowedImporters: string[] = [];
    expect(outside(/from '(?:\.\.?\/)+secrets\//)).toEqual(allowedImporters);
    for (const rel of allowedImporters) expect(rel).not.toMatch(/^(server|auth|devices|realtime|security|sync)\//);
  });

  it('the secrets directory path is resolved only by the layout; nothing else (backup, diagnostics) names it', () => {
    expect(outside(/secretsDir/)).toEqual(['config/data-dir.ts']);
  });

  it('only the existing key protectors and the secret store use the DPAPI primitive', () => {
    expect(outside(/createDpapiProtector/)).toEqual(['backup/schedule-key.ts', 'tls/ca-key-protector.ts']);
    expect(sources().filter((s) => s.rel.startsWith('secrets/') && /createDpapiProtector/.test(s.text)).map((s) => s.rel)).toEqual(['secrets/secret-store.ts']);
  });
});
