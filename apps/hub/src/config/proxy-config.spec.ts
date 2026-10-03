import { describe, expect, it } from 'vitest';
import { applyProxyChange, bindAddress, exposureReadModel, exposureRefusal, parseHubConfig, writeHubConfig } from './hub-config.js';
import { ensureLayout } from './data-dir.js';
import { tempDir } from '../server/test-helpers.js';
import { readFileSync } from 'node:fs';
import { computeSubjectAltNames } from '../tls/names.js';

const proxy = (over: Record<string, unknown> = {}, names: string[] = ['hub.example.com']) =>
  parseHubConfig({ exposure: { names, proxy: { trusted: ['10.0.0.1'], publicOrigin: 'https://hub.example.com', ...over } } });

describe('exposure.proxy validation', () => {
  it('accepts IP literals and CIDRs, normalizes them and the public origin', () => {
    const config = proxy({ trusted: ['10.0.0.1', '192.168.0.0/16', '2001:DB8::/32', '::1', '10.0.0.1'], publicOrigin: 'https://hub.example.com:443/' });
    expect(config.exposure.proxy).toEqual({ trusted: ['10.0.0.1', '192.168.0.0/16', '2001:db8::/32', '::1'], publicOrigin: 'https://hub.example.com' });
    expect(proxy({ publicOrigin: 'https://hub.example.com:8443' }).exposure.proxy?.publicOrigin).toBe('https://hub.example.com:8443');
  });

  it('rejects bad shapes, unknown keys, counts, addresses, prefixes and origins', () => {
    expect(() => proxy({ extra: 1 })).toThrow(/unknown key "extra"/);
    expect(() => parseHubConfig({ exposure: { names: ['hub.example.com'], proxy: [] } })).toThrow(/exposure.proxy/);
    for (const trusted of [[], 'x', [5], ['not-an-ip'], ['10.0.0.1/33'], ['10.0.0.1/x'], ['::1/129'], ['0.0.0.0/0'], ['::/0'], ['10.0.0.1/'], Array.from({ length: 17 }, (_, i) => `10.0.0.${i + 1}`)]) {
      expect(() => proxy({ trusted }), JSON.stringify(trusted)).toThrow();
    }
    expect(proxy({ trusted: Array.from({ length: 16 }, (_, i) => `10.0.0.${i + 1}`) }).exposure.proxy?.trusted).toHaveLength(16);
    for (const publicOrigin of ['http://hub.example.com', 'https://hub.example.com/x', 'https://u@hub.example.com', 'hub.example.com', 5, undefined]) {
      expect(() => proxy({ publicOrigin }), String(publicOrigin)).toThrow();
    }
    expect(() => proxy({ publicOrigin: 'https://other.example.com' })).toThrow(/must be one of "exposure.names"/);
    expect(() => proxy({ trusted: undefined })).toThrow(/trusted/);
  });

  it('forces a loopback listen address except in container mode', () => {
    expect(bindAddress({ bind: 'lan', exposure: proxy().exposure })).toBe('127.0.0.1');
    expect(bindAddress({ bind: 'loopback', exposure: proxy().exposure })).toBe('127.0.0.1');
    expect(bindAddress({ bind: 'container', exposure: proxy().exposure })).toBe('0.0.0.0');
    expect(bindAddress({ bind: 'lan', exposure: { mode: 'private', names: [] } })).toBe('0.0.0.0');
    expect(bindAddress({ bind: 'lan' })).toBe('0.0.0.0');
  });

  it('applyProxyChange adds the public host to the names, forces loopback, and removes the block', () => {
    const base = parseHubConfig({ bind: 'lan', exposure: { names: ['nas'] } });
    const on = applyProxyChange(base, { trusted: ['10.0.0.1'], publicOrigin: 'https://Hub.Example.com:8443' });
    expect(on.bind).toBe('loopback');
    expect(on.exposure.names).toEqual(['nas', 'hub.example.com']);
    expect(on.exposure.proxy).toEqual({ trusted: ['10.0.0.1'], publicOrigin: 'https://hub.example.com:8443' });
    expect(applyProxyChange(parseHubConfig({ bind: 'container' }), { trusted: ['10.0.0.0/8'], publicOrigin: 'https://h.example' }).bind).toBe('container');
    const off = applyProxyChange(on, null);
    expect(off.exposure.proxy).toBeUndefined();
    expect(off.exposure.names).toEqual(['nas', 'hub.example.com']);
    expect(() => applyProxyChange(base, { trusted: ['bad'], publicOrigin: 'https://h.example' })).toThrow();
    expect(() => applyProxyChange(base, { trusted: ['10.0.0.1'], publicOrigin: 'nope' })).toThrow();
  });

  it('writes and reloads the proxy block, and keeps the public name off the Hub certificate', () => {
    const paths = ensureLayout(tempDir());
    const config = proxy();
    writeHubConfig(paths.configFile, config);
    expect(JSON.parse(readFileSync(paths.configFile, 'utf8')).exposure.proxy).toEqual(config.exposure.proxy);
    expect(computeSubjectAltNames(config)).not.toContain('hub.example.com');
    expect(computeSubjectAltNames(parseHubConfig({ exposure: { names: ['hub.example.com'] } }))).toContain('hub.example.com');
  });
});

describe('exposure mode and the read model', () => {
  it('refuses public unless the unreleased env var is set', () => {
    const publicConfig = parseHubConfig({ exposure: { mode: 'public' } });
    expect(exposureRefusal(publicConfig, {})).toMatch(/not released until Phase 31F/);
    expect(exposureRefusal(publicConfig, { DUDE_HUB_UNRELEASED_PUBLIC: '1' })).toBeNull();
    expect(exposureRefusal(parseHubConfig({}), {})).toBeNull();
  });

  it('builds the exposure read model without secrets', () => {
    const model = exposureReadModel(proxy({ trusted: ['10.0.0.1', '10.0.0.2'] }), { bind: 'loopback', port: 4711 }, true);
    expect(model).toEqual({
      mode: 'private', bind: 'loopback', port: 4711, names: ['hub.example.com'], canonicalOrigin: 'https://hub.example.com',
      proxy: { trustedCount: 2, publicOrigin: 'https://hub.example.com' }, hsts: true,
    });
    expect(exposureReadModel(parseHubConfig({}), { port: 1 }, null)).toMatchObject({ proxy: null, canonicalOrigin: null, hsts: null, mode: 'private', bind: 'loopback' });
  });
});
