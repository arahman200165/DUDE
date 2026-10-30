import { mkdtempSync, readFileSync, writeFileSync, existsSync, readdirSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { HUB_DEFAULT_PORT } from '@dude/contracts/hub';
import { ensureLayout, resolveDataDir } from './data-dir.js';
import { applyBackupConfigChange, applyBackupScheduleChange, applyHubNameChange, bindAddress, exposureRefusal, formatHostHeader, loadOrCreateHubConfig, normalizeHubName, parseHubConfig, writeHubConfig } from './hub-config.js';

const tmp = () => mkdtempSync(path.join(os.tmpdir(), 'hub-config-'));

describe('resolveDataDir', () => {
  it('prefers the explicit option, then the env var, else throws', () => {
    expect(resolveDataDir({ dataDir: 'a', env: { DUDE_HUB_DATA_DIR: 'b' } })).toBe(path.resolve('a'));
    expect(resolveDataDir({ env: { DUDE_HUB_DATA_DIR: 'b' } })).toBe(path.resolve('b'));
    expect(() => resolveDataDir({ env: {} })).toThrow(/data directory/);
  });
});

describe('ensureLayout', () => {
  it('creates the directory layout', () => {
    const paths = ensureLayout(path.join(tmp(), 'hub'));
    for (const dir of [paths.serviceDir, paths.dataDir, paths.preMigrationDir, paths.storageDir, paths.backupsDir, paths.configDir, paths.tlsDir, paths.logsDir]) expect(existsSync(dir)).toBe(true);
    expect(paths.dbFile).toBe(path.join(paths.root, 'data', 'dude.db'));
    expect(paths.configFile).toBe(path.join(paths.root, 'config', 'hub.json'));
    expect(paths.webRoot).toBe(path.join(paths.root, 'service', 'web'));
  });
});

describe('hub config', () => {
  it('writes defaults on first start and reloads them', () => {
    const paths = ensureLayout(tmp());
    const cfg = loadOrCreateHubConfig(paths.configFile);
    expect(cfg).toEqual({ port: HUB_DEFAULT_PORT, bind: 'loopback', exposure: { mode: 'private', names: [] } });
    expect(JSON.parse(readFileSync(paths.configFile, 'utf8'))).toEqual({ port: HUB_DEFAULT_PORT, bind: 'loopback' });
    expect(readdirSync(paths.configDir).filter((n) => n.endsWith('.tmp'))).toEqual([]);
    expect(loadOrCreateHubConfig(paths.configFile)).toEqual(cfg);
  });

  it('rejects unknown keys, bad types and bad JSON', () => {
    expect(() => parseHubConfig({ extra: 1 })).toThrow(/unknown key "extra"/);
    expect(() => parseHubConfig({ port: '1' })).toThrow(/port/);
    expect(() => parseHubConfig({ port: 70000 })).toThrow(/port/);
    expect(() => parseHubConfig({ bind: 'wan' })).toThrow(/bind/);
    expect(() => parseHubConfig({ webRoot: 3 })).toThrow(/webRoot/);
    expect(() => parseHubConfig([])).toThrow(/object/);
    const paths = ensureLayout(tmp());
    writeFileSync(paths.configFile, '{nope');
    expect(() => loadOrCreateHubConfig(paths.configFile)).toThrow(/not valid JSON/);
  });

  it('validates exposure strictly and normalizes names', () => {
    const parse = (exposure: unknown) => parseHubConfig({ exposure });
    expect(parse({ names: ['Hub.Example.COM', 'hub.example.com', '10.0.0.5:8443', '2001:DB8::1', 'nas'] }).exposure).toEqual({
      mode: 'private', names: ['hub.example.com', '10.0.0.5:8443', '2001:db8::1', 'nas'],
    });
    expect(parse({ mode: 'public' }).exposure.mode).toBe('public');
    expect(() => parse({ mode: 'open' })).toThrow(/exposure.mode/);
    expect(() => parse({ extra: 1 })).toThrow(/unknown key "extra"/);
    expect(() => parse([])).toThrow(/exposure/);
    for (const bad of ['*.example.com', '[::1]', '[::1]:8443', '::1:8443x', 'bad name', 'a_b.example', '-a.example', 'a..b', '999.1.1.1', 'host:0', 'host:70000', 'host:x', 'https://host', '', 5]) {
      expect(() => parse({ names: [bad] }), String(bad)).toThrow();
    }
    expect(() => parse({ names: Array.from({ length: 33 }, (_, i) => `h${i}.example`) })).toThrow(/at most 32/);
    expect(parse({ names: Array.from({ length: 32 }, (_, i) => `h${i}.example`) }).exposure.names).toHaveLength(32);
  });

  it('validates canonicalOrigin against the names', () => {
    const parse = (canonicalOrigin: unknown, names: string[] = ['hub.example.com']) => parseHubConfig({ exposure: { names, canonicalOrigin } });
    expect(parse('https://hub.example.com').exposure.canonicalOrigin).toBe('https://hub.example.com');
    expect(parse('https://hub.example.com:8443/').exposure.canonicalOrigin).toBe('https://hub.example.com:8443');
    expect(parse('https://localhost:48200', []).exposure.canonicalOrigin).toBe('https://localhost:48200');
    expect(parse('https://[2001:db8::1]:8443', ['2001:db8::1']).exposure.canonicalOrigin).toBe('https://[2001:db8::1]:8443');
    expect(() => parse('https://other.example.com')).toThrow(/must be one of/);
    expect(() => parse('http://hub.example.com')).toThrow(/https/);
    expect(() => parse('https://hub.example.com/path')).toThrow(/no path/);
    expect(() => parse('https://user@hub.example.com')).toThrow();
    expect(() => parse('nope')).toThrow();
    expect(() => parse(3)).toThrow(/string/);
  });

  it('omits the default exposure on write and keeps a configured one', () => {
    const paths = ensureLayout(tmp());
    writeHubConfig(paths.configFile, parseHubConfig({ port: 5, exposure: { mode: 'private', names: [] } }));
    expect(JSON.parse(readFileSync(paths.configFile, 'utf8'))).toEqual({ port: 5, bind: 'loopback' });
    const configured = parseHubConfig({ exposure: { names: ['hub.example.com'] } });
    writeHubConfig(paths.configFile, configured);
    expect(JSON.parse(readFileSync(paths.configFile, 'utf8')).exposure).toEqual({ mode: 'private', names: ['hub.example.com'] });
    expect(loadOrCreateHubConfig(paths.configFile)).toEqual(configured);
  });

  it('refuses public exposure at start only when the bind cannot accept inbound traffic, and formats host headers', () => {
    expect(exposureRefusal(parseHubConfig({}))).toBeNull();
    expect(exposureRefusal(parseHubConfig({ exposure: { mode: 'public' } }))).toMatch(/network lan on.*network proxy on/);
    expect(exposureRefusal(parseHubConfig({ bind: 'lan', exposure: { mode: 'public' } }))).toBeNull();
    expect(exposureRefusal(parseHubConfig({ bind: 'container', exposure: { mode: 'public' } }))).toBeNull();
    expect(exposureRefusal(parseHubConfig({ exposure: { mode: 'public', names: ['hub.example.com'], proxy: { trusted: ['10.0.0.1'], publicOrigin: 'https://hub.example.com' } } }))).toBeNull();
    expect(formatHostHeader(normalizeHubName('2001:db8::1'), 8443)).toBe('[2001:db8::1]:8443');
    expect(formatHostHeader(normalizeHubName('Hub.Example:8443'))).toBe('hub.example:8443');
    expect(formatHostHeader(normalizeHubName('hub.example'))).toBe('hub.example');
  });

  it('applies name changes', () => {
    const exposure = parseHubConfig({ exposure: { names: ['a.example'], canonicalOrigin: 'https://a.example' } }).exposure;
    expect(applyHubNameChange(exposure, { add: 'B.example' })).toEqual(['a.example', 'b.example']);
    expect(applyHubNameChange(exposure, { add: 'a.example' })).toBe(exposure.names);
    expect(() => applyHubNameChange(exposure, { remove: 'zzz.example' })).toThrow(/not a configured/);
    expect(() => applyHubNameChange(exposure, { remove: 'a.example' })).toThrow(/canonicalOrigin/);
    expect(() => applyHubNameChange({ mode: 'private', names: Array.from({ length: 32 }, (_, i) => `h${i}.example`) }, { add: 'x.example' })).toThrow(/at most 32/i);
  });

  it('validates the optional backup schedule strictly, round-trips it and is absent by default', () => {
    const folder = path.resolve(tmp(), 'backups-out');
    expect(parseHubConfig({}).backup).toBeUndefined();
    expect(parseHubConfig({ backup: {} }).backup).toBeUndefined();
    const configured = parseHubConfig({ backup: { schedule: { folder, intervalHours: 24, retention: 7 } } });
    expect(configured.backup).toEqual({ schedule: { folder, intervalHours: 24, retention: 7 } });
    const paths = ensureLayout(tmp());
    writeHubConfig(paths.configFile, configured);
    expect(JSON.parse(readFileSync(paths.configFile, 'utf8')).backup).toEqual({ schedule: { folder, intervalHours: 24, retention: 7 } });
    expect(loadOrCreateHubConfig(paths.configFile)).toEqual(configured);
    const schedule = (value: unknown) => parseHubConfig({ backup: { schedule: value } });
    expect(() => parseHubConfig({ backup: { extra: 1 } })).toThrow(/unknown key "extra"/);
    expect(() => parseHubConfig({ backup: [] })).toThrow(/backup/);
    expect(() => schedule({ folder, intervalHours: 24, retention: 7, extra: 1 })).toThrow(/unknown key "extra"/);
    expect(() => schedule({ folder: 'relative/dir', intervalHours: 24, retention: 7 })).toThrow(/absolute/);
    expect(() => schedule({ folder: '', intervalHours: 24, retention: 7 })).toThrow(/folder/);
    expect(() => schedule({ folder, intervalHours: 0, retention: 7 })).toThrow(/intervalHours/);
    expect(() => schedule({ folder, intervalHours: 8761, retention: 7 })).toThrow(/intervalHours/);
    expect(() => schedule({ folder, intervalHours: 1.5, retention: 7 })).toThrow(/intervalHours/);
    expect(() => schedule({ folder, intervalHours: 24, retention: 0 })).toThrow(/retention/);
    expect(() => schedule({ folder, intervalHours: 24, retention: 1001 })).toThrow(/retention/);
    expect(() => schedule({ folder, intervalHours: '24', retention: 7 })).toThrow(/intervalHours/);
    expect(schedule({ folder, intervalHours: 8760, retention: 1000 }).backup?.schedule).toMatchObject({ intervalHours: 8760, retention: 1000 });
    expect(applyBackupScheduleChange(parseHubConfig({}), { folder, intervalHours: 6, retention: 3 }).backup?.schedule?.intervalHours).toBe(6);
    expect(applyBackupScheduleChange(configured, null).backup).toBeUndefined();
  });

  it('backup v2 (Milestone 847): an interval-only schedule and strict destination definitions, kept apart by the change helper', () => {
    const folder = path.resolve(tmp(), 'repo');
    const destination = { id: 'd-1a2b3c4d', kind: 'local-folder', label: 'USB disk', folder };
    const parsed = parseHubConfig({ backup: { schedule: { intervalHours: 12 }, destinations: [destination] } });
    expect(parsed.backup).toEqual({ schedule: { intervalHours: 12 }, destinations: [destination] });
    expect(parseHubConfig({ backup: { destinations: [] } }).backup).toBeUndefined();
    const bad = (value: Record<string, unknown>) => () => parseHubConfig({ backup: { destinations: [{ ...destination, ...value }] } });
    expect(bad({ id: 'Upper' })).toThrow(/id/);
    expect(bad({ kind: 'ftp' })).toThrow(/kind/);
    expect(bad({ label: '' })).toThrow(/label/);
    expect(bad({ label: 'x'.repeat(65) })).toThrow(/label/);
    expect(bad({ folder: 'relative' })).toThrow(/folder/);
    expect(bad({ secret: 'x' })).toThrow(/unknown key "secret"/);
    expect(() => parseHubConfig({ backup: { destinations: [destination, destination] } })).toThrow(/repeated id/);
    expect(() => parseHubConfig({ backup: { destinations: Array.from({ length: 9 }, (_, i) => ({ ...destination, id: `d-${i}` })) } })).toThrow(/at most 8/);
    const withDest = applyBackupConfigChange(parseHubConfig({}), { destinations: [destination as never] });
    const scheduled = applyBackupConfigChange(withDest, { schedule: { intervalHours: 6 } });
    expect(scheduled.backup).toEqual({ schedule: { intervalHours: 6 }, destinations: [destination] });
    expect(applyBackupConfigChange(scheduled, { schedule: null }).backup).toEqual({ destinations: [destination] });
    expect(applyBackupConfigChange(scheduled, { destinations: [] }).backup).toEqual({ schedule: { intervalHours: 6 } });
    expect(applyBackupConfigChange(scheduled, { schedule: null, destinations: [] }).backup).toBeUndefined();
  });

  it('a Google Drive destination (Milestone 856) keeps only a folder id and the public client id, and no secret key or foreign field is accepted', () => {
    const drive = { id: 'd-1a2b3c4d', kind: 'drive', label: 'My Drive', folderId: '1AbCdEfGhIjKlMnOpQrStUvWxYz012345', clientId: '123456-abc.apps.googleusercontent.com' };
    const parsed = parseHubConfig({ backup: { destinations: [drive] } });
    expect(parsed.backup).toEqual({ destinations: [drive] });
    const bad = (value: Record<string, unknown>) => () => parseHubConfig({ backup: { destinations: [{ ...drive, ...value }] } });
    expect(bad({ folderId: undefined })).toThrow(/folderId/);
    expect(bad({ folderId: 'short' })).toThrow(/folderId/);
    expect(bad({ folderId: 'has/slash/in/it/0123456789' })).toThrow(/folderId/);
    expect(bad({ clientId: undefined })).toThrow(/clientId/);
    expect(bad({ clientId: 'has space' })).toThrow(/clientId/);
    expect(bad({ clientId: 'x'.repeat(257) })).toThrow(/clientId/);
    expect(bad({ folder: path.resolve(tmp(), 'repo') })).toThrow(/folder is not allowed on a drive destination/);
    for (const key of ['endpoint', 'region', 'bucket', 'prefix', 'forcePathStyle', 'allowPrivateNetwork']) expect(bad({ [key]: 'x' }), key).toThrow(/not allowed on a drive destination/);
    for (const key of ['clientSecret', 'refreshToken', 'accessToken', 'token', 'password']) expect(bad({ [key]: 'x' }), key).toThrow(new RegExp(`unknown key "${key}"`));
    // The other kinds refuse the Drive fields, and the kind list names all three.
    const folder = path.resolve(tmp(), 'repo');
    expect(() => parseHubConfig({ backup: { destinations: [{ id: 'd-1', kind: 'local-folder', label: 'x', folder, folderId: drive.folderId }] } })).toThrow(/folderId is not allowed on a local-folder destination/);
    expect(() => parseHubConfig({ backup: { destinations: [{ id: 'd-1', kind: 's3', label: 'x', endpoint: 'https://s3.example.com', region: 'us-east-1', bucket: 'my-backups', clientId: 'x' }] } })).toThrow(/clientId is not allowed on an s3 destination/);
    expect(() => parseHubConfig({ backup: { destinations: [{ ...drive, kind: 'onedrive' }] } })).toThrow(/"local-folder", "s3" or "drive"/);
    const applied = applyBackupConfigChange(parseHubConfig({}), { destinations: [drive as never] });
    expect(applied.backup).toEqual({ destinations: [drive] });
  });

  it('maps bind modes to addresses', () => {
    expect(bindAddress({ bind: 'loopback' })).toBe('127.0.0.1');
    expect(bindAddress({ bind: 'lan' })).toBe('0.0.0.0');
    expect(bindAddress({ bind: 'container' })).toBe('0.0.0.0');
  });
});
