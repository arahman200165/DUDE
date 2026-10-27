import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { applyTunnelChange, bindAddress, defaultHubConfig, loadOrCreateHubConfig, normalizeTunnelHostname, parseHubConfig, writeHubConfig } from './hub-config.js';

/** `exposure.tunnel` (32-SS1, Milestone 837): strict keys, and tunnel mode is reverse-proxy mode with the loopback connector as the only hop. */
const HOST = 'notes.example.com';
const valid = (over: Record<string, unknown> = {}) => ({
  exposure: {
    names: [HOST], proxy: { trusted: ['127.0.0.1', '::1'], publicOrigin: `https://${HOST}` }, tunnel: { enabled: true, hostname: HOST }, ...over,
  },
});
const dirs: string[] = [];
afterEach(() => { for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true }); });

describe('exposure.tunnel validation', () => {
  it('accepts the tunnel block with the loopback proxy it implies, and the Hub binds loopback only', () => {
    const config = parseHubConfig(valid());
    expect(config.exposure.tunnel).toEqual({ enabled: true, hostname: HOST });
    expect(config.exposure.proxy).toEqual({ trusted: ['127.0.0.1', '::1'], publicOrigin: `https://${HOST}` });
    expect(bindAddress(config)).toBe('127.0.0.1');
  });

  it('accepts a disabled block and a single loopback address', () => {
    expect(parseHubConfig(valid({ tunnel: { enabled: false, hostname: HOST }, proxy: { trusted: ['::1'], publicOrigin: `https://${HOST}` } })).exposure.tunnel?.enabled).toBe(false);
  });

  it('rejects an unknown key, a non-boolean enabled and a non-object', () => {
    expect(() => parseHubConfig(valid({ tunnel: { enabled: true, hostname: HOST, metricsPort: 1 } }))).toThrow(/unknown key "metricsPort"/);
    expect(() => parseHubConfig(valid({ tunnel: { enabled: 'yes', hostname: HOST } }))).toThrow(/enabled/);
    expect(() => parseHubConfig(valid({ tunnel: { hostname: HOST } }))).toThrow(/enabled/);
    expect(() => parseHubConfig(valid({ tunnel: true }))).toThrow(/must be an object/);
    expect(() => parseHubConfig({ tunnel: {} })).toThrow(/unknown key "tunnel"/);
  });

  it.each([
    ['an IP address', '203.0.113.7'],
    ['a single label', 'hub'],
    ['a local suffix', 'hub.local'],
    ['www', `www.${HOST}`],
    ['a port', `${HOST}:8443`],
    ['a wildcard', `*.${HOST}`],
    ['an uppercase-only invalid name', 'not a name'],
  ])('rejects %s as the hostname', (_label, hostname) => {
    expect(() => parseHubConfig(valid({ tunnel: { enabled: true, hostname } }))).toThrow(/exposure\.tunnel\.hostname/);
  });

  it('requires the proxy block, loopback-only trust and the matching public origin', () => {
    expect(() => parseHubConfig({ exposure: { names: [HOST], tunnel: { enabled: true, hostname: HOST } } })).toThrow(/requires "exposure.proxy"/);
    for (const trusted of [['10.0.0.1'], ['127.0.0.1', '10.0.0.1'], ['127.0.0.0/8'], ['::1/128']]) {
      expect(() => parseHubConfig(valid({ proxy: { trusted, publicOrigin: `https://${HOST}` } }))).toThrow(/only 127\.0\.0\.1 and ::1/);
    }
    expect(() => parseHubConfig(valid({ names: [HOST, 'other.example.com'], proxy: { trusted: ['127.0.0.1'], publicOrigin: 'https://other.example.com' } }))).toThrow(/publicOrigin/);
    expect(() => parseHubConfig(valid({ proxy: { trusted: ['127.0.0.1'], publicOrigin: `https://${HOST}:8443` } }))).toThrow(/publicOrigin/);
  });

  it('normalizes the hostname to lower case', () => {
    expect(normalizeTunnelHostname('Notes.Example.COM')).toBe('notes.example.com');
    expect(() => normalizeTunnelHostname(42)).toThrow(/must be a string/);
  });
});

describe('applyTunnelChange', () => {
  it('turns tunnel mode on: the name joins, the proxy is the loopback hop, the bind stays loopback', () => {
    const next = applyTunnelChange(defaultHubConfig(), { hostname: HOST.toUpperCase() });
    expect(next.bind).toBe('loopback');
    expect(next.exposure.names).toEqual([HOST]);
    expect(next.exposure.proxy).toEqual({ trusted: ['127.0.0.1', '::1'], publicOrigin: `https://${HOST}` });
    expect(next.exposure.tunnel).toEqual({ enabled: true, hostname: HOST });
    expect(next.exposure.mode).toBe('private'); // the tunnel is not the public-mode switch
  });

  it('forces a LAN bind back to loopback', () => {
    expect(applyTunnelChange({ ...defaultHubConfig(), bind: 'lan' }, { hostname: HOST }).bind).toBe('loopback');
  });

  it('refuses to replace an operator\'s own reverse proxy', () => {
    const config = parseHubConfig({ exposure: { names: ['hub.example.com'], proxy: { trusted: ['10.0.0.1'], publicOrigin: 'https://hub.example.com' } } });
    expect(() => applyTunnelChange(config, { hostname: HOST })).toThrow(/reverse proxy is already configured/);
    // ... and `off` leaves that proxy alone (it was never the tunnel's).
    expect(applyTunnelChange(config, null)).toBe(config);
  });

  it('is idempotent and can change the domain', () => {
    const once = applyTunnelChange(defaultHubConfig(), { hostname: HOST });
    expect(applyTunnelChange(once, { hostname: HOST })).toEqual(once);
    const moved = applyTunnelChange(once, { hostname: 'other.example.org' });
    expect(moved.exposure.proxy?.publicOrigin).toBe('https://other.example.org');
    expect(moved.exposure.tunnel?.hostname).toBe('other.example.org');
  });

  it('turns it off: the tunnel and its proxy block go, and a public mode that could no longer accept traffic returns to private', () => {
    const on = applyTunnelChange(defaultHubConfig(), { hostname: HOST });
    const off = applyTunnelChange({ ...on, exposure: { ...on.exposure, mode: 'public' } }, null);
    expect(off.exposure.tunnel).toBeUndefined();
    expect(off.exposure.proxy).toBeUndefined();
    expect(off.exposure.mode).toBe('private');
    expect(off.exposure.names).toEqual([HOST]);
  });

  it('writes and reloads: the block survives a round trip and the default config stays minimal', () => {
    const dir = mkdtempSync(path.join(os.tmpdir(), 'hub-tunnel-cfg-'));
    dirs.push(dir);
    const file = path.join(dir, 'hub.json');
    writeHubConfig(file, defaultHubConfig());
    expect(JSON.parse(readFileSync(file, 'utf8'))).not.toHaveProperty('exposure');
    writeHubConfig(file, applyTunnelChange(defaultHubConfig(), { hostname: HOST }));
    expect(JSON.parse(readFileSync(file, 'utf8')).exposure.tunnel).toEqual({ enabled: true, hostname: HOST });
    expect(loadOrCreateHubConfig(file).exposure.tunnel).toEqual({ enabled: true, hostname: HOST });
    writeFileSync(file, JSON.stringify({ exposure: { names: [HOST], tunnel: { enabled: true, hostname: HOST } } }));
    expect(() => loadOrCreateHubConfig(file)).toThrow(/requires "exposure.proxy"/);
  });
});
