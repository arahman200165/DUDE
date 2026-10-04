import type { NetworkInterfaceInfo } from 'node:os';
import { describe, expect, it } from 'vitest';
import { classifyAddress, createCachedNameResolver, dnsNamesToResolve, ipv6Prefix64, listHubAddresses, resolveNames, stableAddresses } from './addresses.js';
import type { DnsResolver } from './addresses.js';

const code = (c: string): Error => Object.assign(new Error(c), { code: c });

describe('classifyAddress', () => {
  it.each([
    ['127.0.0.1', 'loopback'], ['::1', 'loopback'],
    ['10.1.2.3', 'private'], ['172.16.0.1', 'private'], ['172.31.255.1', 'private'], ['172.32.0.1', 'public'], ['192.168.1.5', 'private'], ['192.169.1.5', 'public'],
    ['100.64.0.1', 'cgnat'], ['100.127.9.9', 'cgnat'], ['100.128.0.1', 'public'],
    ['169.254.10.1', 'link-local'], ['fe80::1', 'link-local'], ['febf::1', 'link-local'], ['fec0::1', 'public'],
    ['fc00::1', 'unique-local'], ['fd12:3456::1', 'unique-local'], ['2001:db8::1', 'public'], ['203.0.113.7', 'public'], ['fe80::1%Ethernet', 'link-local'],
  ] as const)('%s is %s', (address, scope) => expect(classifyAddress(address)).toBe(scope));
});

describe('listHubAddresses', () => {
  it('skips loopback, classifies, de-duplicates and sorts', () => {
    const info = (address: string, family: 'IPv4' | 'IPv6', internal = false) => ({ address, family, internal, netmask: '', mac: '', cidr: null }) as NetworkInterfaceInfo;
    const list = listHubAddresses({
      lo: [info('127.0.0.1', 'IPv4', true), info('::1', 'IPv6', true)],
      eth0: [info('192.168.1.5', 'IPv4'), info('fe80::1%eth0', 'IPv6'), info('2001:db8::5', 'IPv6')],
      eth1: [info('192.168.1.5', 'IPv4'), info('100.64.1.1', 'IPv4')],
    });
    expect(list).toEqual([
      { address: '100.64.1.1', family: 4, scope: 'cgnat' },
      { address: '192.168.1.5', family: 4, scope: 'private' },
      { address: '2001:db8::5', family: 6, scope: 'public' },
      { address: 'fe80::1', family: 6, scope: 'link-local' },
    ]);
  });
});

describe('resolveNames', () => {
  const resolver = (v4: Record<string, string[] | Error>, v6: Record<string, string[] | Error> = {}): DnsResolver => ({
    resolve4: (n) => { const r = v4[n] ?? code('ENOTFOUND'); return r instanceof Error ? Promise.reject(r) : Promise.resolve(r); },
    resolve6: (n) => { const r = v6[n] ?? code('ENODATA'); return r instanceof Error ? Promise.reject(r) : Promise.resolve(r); },
  });

  it('merges A and AAAA answers', async () => {
    expect(await resolveNames(['hub.example.com'], resolver({ 'hub.example.com': ['203.0.113.7'] }, { 'hub.example.com': ['2001:db8::1'] })))
      .toEqual([{ name: 'hub.example.com', addresses: ['2001:db8::1', '203.0.113.7'] }]);
  });
  it('reports not-found, failed and timeout', async () => {
    expect(await resolveNames(['a.example'], resolver({}))).toEqual([{ name: 'a.example', addresses: [], error: 'not-found' }]);
    expect(await resolveNames(['a.example'], resolver({ 'a.example': code('ESERVFAIL') }))).toEqual([{ name: 'a.example', addresses: [], error: 'failed' }]);
    const hang: DnsResolver = { resolve4: () => new Promise(() => undefined), resolve6: () => Promise.reject(code('ENODATA')) };
    expect(await resolveNames(['a.example'], hang, 20)).toEqual([{ name: 'a.example', addresses: [], error: 'timeout' }]);
  });
  it('caches for 60 s per name set', async () => {
    let calls = 0;
    let t = 0;
    const counting: DnsResolver = { resolve4: () => { calls += 1; return Promise.resolve(['203.0.113.7']); }, resolve6: () => Promise.reject(code('ENODATA')) };
    const cached = createCachedNameResolver({ resolver: counting, now: () => t });
    await cached(['a.example']);
    await cached(['a.example']);
    expect(calls).toBe(1);
    t = 61_000;
    await cached(['a.example']);
    expect(calls).toBe(2);
  });
});

describe('dnsNamesToResolve', () => {
  it('keeps DNS names and the canonical host, drops IPs, ports and localhost', () => {
    expect(dnsNamesToResolve({ names: ['Hub.Example.com:8443', '192.168.1.5', '2001:db8::1', 'localhost'], canonicalOrigin: 'https://hub2.example.com' })).toEqual(['hub.example.com', 'hub2.example.com']);
    expect(dnsNamesToResolve({ names: [] })).toEqual([]);
  });
});

describe('IPv6 drift prefixes', () => {
  it('collapses privacy addresses into their /64', () => {
    expect(ipv6Prefix64('2001:db8:1:2:aaaa:bbbb:cccc:dddd')).toBe('2001:db8:1:2::/64');
    expect(ipv6Prefix64('2001:db8:1:2::5')).toBe('2001:db8:1:2::/64');
    expect(ipv6Prefix64('2001:db8::1')).toBe('2001:db8:0:0::/64');
    const addrs = listHubAddresses({ eth0: [
      { address: '2001:db8:1:2::1', family: 'IPv6', internal: false, netmask: '', mac: '', cidr: null, scopeid: 0 },
      { address: '2001:db8:1:2:1111:2222:3333:4444', family: 'IPv6', internal: false, netmask: '', mac: '', cidr: null, scopeid: 0 },
      { address: '192.168.1.5', family: 'IPv4', internal: false, netmask: '', mac: '', cidr: null, scopeid: 0 },
    ] } as never);
    expect(stableAddresses(addrs)).toEqual(['192.168.1.5', '2001:db8:1:2::/64']);
  });
});
