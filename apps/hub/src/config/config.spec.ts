import { mkdtempSync, readFileSync, writeFileSync, existsSync, readdirSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { HUB_DEFAULT_PORT } from '@dude/contracts/hub';
import { ensureLayout, resolveDataDir } from './data-dir.js';
import { applyHubNameChange, bindAddress, exposureRefusal, formatHostHeader, loadOrCreateHubConfig, normalizeHubName, parseHubConfig, writeHubConfig } from './hub-config.js';

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

  it('maps bind modes to addresses', () => {
    expect(bindAddress({ bind: 'loopback' })).toBe('127.0.0.1');
    expect(bindAddress({ bind: 'lan' })).toBe('0.0.0.0');
    expect(bindAddress({ bind: 'container' })).toBe('0.0.0.0');
  });
});
