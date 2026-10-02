import { mkdtempSync, readFileSync, writeFileSync, existsSync, readdirSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { HUB_DEFAULT_PORT } from '@dude/contracts/hub';
import { ensureLayout, resolveDataDir } from './data-dir.js';
import { bindAddress, loadOrCreateHubConfig, parseHubConfig } from './hub-config.js';

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
    expect(cfg).toEqual({ port: HUB_DEFAULT_PORT, bind: 'loopback' });
    expect(JSON.parse(readFileSync(paths.configFile, 'utf8'))).toEqual(cfg);
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

  it('maps bind modes to addresses', () => {
    expect(bindAddress({ bind: 'loopback' })).toBe('127.0.0.1');
    expect(bindAddress({ bind: 'lan' })).toBe('0.0.0.0');
    expect(bindAddress({ bind: 'container' })).toBe('0.0.0.0');
  });
});
