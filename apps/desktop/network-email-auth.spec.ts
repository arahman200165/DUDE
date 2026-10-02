import { describe, expect, it } from 'vitest';
import { generateKeyPairSync } from 'node:crypto';
import { analyzeDmarc, analyzeSpf, checkHost, cidrContains, expandMacros, inspectEmailAuth, organizationalDomain, parseDkimSignatures, parseSpf, type DnsFetcher } from './network-email-auth';

type Zone = Record<string, Partial<Record<'TXT' | 'A' | 'AAAA' | 'MX', string[]>>>;
function zoneFetcher(zone: Zone, log: string[] = []): DnsFetcher {
  return async (name, type) => {
    log.push(`${type} ${name}`);
    const entry = zone[name.toLowerCase()];
    return { rcode: entry ? 'NOERROR' : 'NXDOMAIN', values: entry?.[type] ?? [] };
  };
}
const spki = (bits: number) => generateKeyPairSync('rsa', { modulusLength: bits }).publicKey.export({ format: 'der', type: 'spki' }).toString('base64');

describe('SPF (RFC 7208)', () => {
  const zone: Zone = {
    'example.test': { TXT: ['v=spf1 ip4:192.0.2.0/24 include:_spf.vendor.test mx a:relay.example.test ~all', 'google-site-verification=x'], MX: ['10 mx1.example.test.'] },
    '_spf.vendor.test': { TXT: ['v=spf1 ip6:2001:db8::/32 -all'] },
    'mx1.example.test': { A: ['198.51.100.10'] },
    'relay.example.test': { A: ['198.51.100.20'] },
  };
  it('builds the include tree, counts lookups, and flattens ranges', async () => {
    const result = await analyzeSpf(zoneFetcher(zone), 'example.test');
    expect(result.lookupCount).toBe(3);
    expect(result.flattened.map((entry) => entry.range)).toEqual(['192.0.2.0/24', '2001:db8::/32', '198.51.100.10/32', '198.51.100.20/32']);
    expect(result.findings.find((finding) => finding.id === 'spf-softfail')?.status).toBe('pass');
  });
  it('evaluates check_host() for a sender IP', async () => {
    const fetch = zoneFetcher(zone);
    expect((await checkHost(fetch, '192.0.2.44', 'example.test', 'a@example.test')).result).toBe('pass');
    expect((await checkHost(fetch, '2001:db8::5', 'example.test', 'a@example.test')).result).toBe('pass');
    expect((await checkHost(fetch, '198.51.100.10', 'example.test', 'a@example.test')).result).toBe('pass');
    expect((await checkHost(fetch, '203.0.113.9', 'example.test', 'a@example.test')).result).toBe('softfail');
    expect((await checkHost(fetch, '203.0.113.9', 'nothing.test', 'a@nothing.test')).result).toBe('none');
  });
  it('reports permerror for more than 10 lookups, multiple records, and +all', async () => {
    const includes = Array.from({ length: 11 }, (_, i) => `include:i${i}.test`).join(' ');
    const big: Zone = { 'big.test': { TXT: [`v=spf1 ${includes} -all`] } };
    for (let i = 0; i < 11; i++) big[`i${i}.test`] = { TXT: ['v=spf1 -all'] };
    expect((await analyzeSpf(zoneFetcher(big), 'big.test')).findings.find((finding) => finding.id === 'spf-lookups')?.status).toBe('fail');
    expect((await checkHost(zoneFetcher(big), '192.0.2.1', 'big.test', 'x@big.test')).result).toBe('permerror');
    const twice = await analyzeSpf(zoneFetcher({ 'two.test': { TXT: ['v=spf1 -all', 'v=spf1 ~all'] } }), 'two.test');
    expect(twice.findings[0].id).toBe('spf-multiple');
    const open = await analyzeSpf(zoneFetcher({ 'open.test': { TXT: ['v=spf1 +all'] } }), 'open.test');
    expect(open.findings.some((finding) => finding.id === 'spf-plus-all' && finding.status === 'fail')).toBe(true);
    expect(parseSpf('v=spf1 ip4:300.1.1.1 -all').errors[0]).toMatch(/Invalid ip4/);
  });
  it('expands macros per the RFC 7208 §7.4 examples', () => {
    const context = { ip: '192.0.2.3', sender: 'strong-bad@email.example.com', domain: 'email.example.com' };
    const cases: [string, string][] = [
      ['%{s}', 'strong-bad@email.example.com'], ['%{o}', 'email.example.com'], ['%{d4}', 'email.example.com'], ['%{d2}', 'example.com'],
      ['%{d1}', 'com'], ['%{dr}', 'com.example.email'], ['%{d2r}', 'example.email'], ['%{l}', 'strong-bad'], ['%{l-}', 'strong.bad'],
      ['%{lr-}', 'bad.strong'], ['%{l1r-}', 'strong'], ['%{ir}.%{v}._spf.%{d2}', '3.2.0.192.in-addr._spf.example.com'],
    ];
    for (const [macro, expected] of cases) expect(expandMacros(macro, context), macro).toBe(expected);
    expect(expandMacros('%{ir}.%{v}._spf.%{d2}', { ...context, ip: '2001:db8::cb01' })).toBe('1.0.b.c.0.0.0.0.0.0.0.0.0.0.0.0.0.0.0.0.0.0.0.0.8.b.d.0.1.0.0.2.ip6._spf.example.com');
    expect(cidrContains('2001:db8::', 32, '2001:db8:ffff::1')).toBe(true);
    expect(cidrContains('192.0.2.0', 24, '192.0.3.1')).toBe(false);
  });
});

describe('DKIM', () => {
  it('reports key size, revoked keys, testing mode, and pasted-header selectors', async () => {
    const zone: Zone = {
      'strong._domainkey.example.test': { TXT: [`v=DKIM1; k=rsa; p=${spki(2048)}`] },
      'weak._domainkey.example.test': { TXT: [`v=DKIM1; k=rsa; t=y; p=${spki(1024)}`] },
      'old._domainkey.example.test': { TXT: ['v=DKIM1; p='] },
      'hdr._domainkey.mail.test': { TXT: [`v=DKIM1; k=ed25519; p=${Buffer.alloc(32, 7).toString('base64')}`] },
    };
    const headers = 'From: a@mail.test\r\nDKIM-Signature: v=1; a=ed25519-sha256; c=relaxed/relaxed; d=mail.test;\r\n s=hdr; h=from:to; bh=x; b=y\r\nSubject: hi';
    expect(parseDkimSignatures(headers)).toEqual([expect.objectContaining({ domain: 'mail.test', selector: 'hdr', algorithm: 'ed25519-sha256' })]);
    const result = await inspectEmailAuth({ kind: 'email-auth', target: 'example.test', emailChecks: ['dkim'], dkimSelectors: ['strong', 'weak', 'old', 'missing'], dkimHeaders: headers }, new AbortController().signal, () => {}, zoneFetcher(zone));
    const keys = Object.fromEntries(result.dkim!.keys.map((key) => [key.selector, key]));
    expect(keys['strong'].keyBits).toBe(2048);
    expect(keys['weak'].findings.map((finding) => finding.status)).toEqual(['warn', 'warn']);
    expect(keys['old'].revoked).toBe(true);
    expect(keys['missing'].found).toBe(false);
    expect(keys['hdr']).toMatchObject({ source: 'header', keyType: 'ed25519', domain: 'mail.test' });
  });
  it('labels common-selector hits as guessed and hides misses', async () => {
    const zone: Zone = { 'google._domainkey.example.test': { TXT: [`v=DKIM1; p=${spki(2048)}`] } };
    const log: string[] = [];
    const result = await inspectEmailAuth({ kind: 'email-auth', target: 'example.test', emailChecks: ['dkim'], dkimCommonProbe: true }, new AbortController().signal, () => {}, zoneFetcher(zone, log));
    expect(result.dkim!.keys).toEqual([expect.objectContaining({ selector: 'google', source: 'guessed', found: true })]);
    expect(log).toHaveLength(20);
  });
});

describe('DMARC (RFC 7489)', () => {
  it('finds the organizational domain with the Public Suffix List', () => {
    expect(organizationalDomain('mail.example.co.uk')).toBe('example.co.uk');
    expect(organizationalDomain('a.b.example.com')).toBe('example.com');
    expect(organizationalDomain('example.com')).toBe('example.com');
    expect(organizationalDomain('www.city.kawasaki.jp')).toBe('city.kawasaki.jp');
  });
  it('falls back to the organizational domain and checks external report authorization', async () => {
    const zone: Zone = {
      '_dmarc.example.com': { TXT: ['v=DMARC1; p=quarantine; sp=reject; pct=50; rua=mailto:agg@reports.vendor.net,mailto:dmarc@example.com'] },
      'example.com._report._dmarc.reports.vendor.net': { TXT: [] },
    };
    const result = await analyzeDmarc(zoneFetcher(zone), 'news.example.com');
    expect(result.queried).toEqual(['_dmarc.news.example.com', '_dmarc.example.com']);
    expect(result.policyDomain).toBe('example.com');
    expect(result.reportDestinations).toEqual([
      expect.objectContaining({ uri: 'mailto:agg@reports.vendor.net', external: true, authorized: false }),
      expect.objectContaining({ uri: 'mailto:dmarc@example.com', external: false }),
    ]);
    expect(result.findings.map((finding) => finding.id)).toEqual(expect.arrayContaining(['dmarc-org', 'dmarc-pct', 'dmarc-ext-reports.vendor.net']));
  });
  it('flags p=none and a missing record', async () => {
    expect((await analyzeDmarc(zoneFetcher({ '_dmarc.x.test': { TXT: ['v=DMARC1; p=none'] } }), 'x.test')).findings.find((finding) => finding.id === 'dmarc-p')?.status).toBe('warn');
    expect((await analyzeDmarc(zoneFetcher({}), 'y.test')).findings[0].id).toBe('dmarc-none');
  });
});
