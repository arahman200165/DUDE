import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { decodeMessage } from './network-dns';
import { compareNames, dsDigest, inspectDnssec, keyTag, nsec3Hash, parseDnskey, ROOT_TRUST_ANCHORS, type DnssecFetch } from './network-dnssec';

interface Recorded { capturedAt: string; cases: Record<string, { target: string; recordType: string; expectedStatus: string; resolverAuthenticated: boolean; packets: Record<string, string> }> }
const recorded = JSON.parse(readFileSync(join(__dirname, '__fixtures__/dnssec/recorded.json'), 'utf8')) as Recorded;
const now = Date.parse(recorded.capturedAt);

function replay(packets: Record<string, string>, tamper?: (key: string, packet: Buffer) => Buffer): DnssecFetch {
  return async (name, qtype, options) => {
    const key = `${name.toLowerCase()}|${qtype}|${options.checkingDisabled ? 1 : 0}`;
    const packet = packets[key];
    if (!packet) throw new Error(`No recorded packet for ${key}`);
    const bytes = Buffer.from(packet, 'base64');
    return { packet: tamper ? tamper(key, bytes) : bytes, contacted: 'replay' };
  };
}
const run = (label: string, tamper?: (key: string, packet: Buffer) => Buffer) => {
  const entry = recorded.cases[label];
  return inspectDnssec({ kind: 'dnssec-inspector', target: entry.target, recordType: entry.recordType as never, resolver: '1.1.1.1' }, new AbortController().signal, () => {}, now, replay(entry.packets, tamper));
};

describe('DNSSEC chain-of-trust validation (recorded real responses)', () => {
  it('agrees with the independent validating resolver for every recorded case', async () => {
    for (const [label, entry] of Object.entries(recorded.cases)) {
      const result = await run(label);
      expect(result.status, label).toBe(entry.expectedStatus);
      // Cloudflare's AD bit is an independent validator verdict: AD ⇔ secure.
      expect(result.status === 'secure', `${label} AD agreement`).toBe(entry.resolverAuthenticated);
    }
  });

  it('walks root → TLD → zone and reports keys, DS matches, and signatures', async () => {
    const result = await run('secure');
    expect(result.zones.map((zone) => zone.zone)).toEqual(['.', 'com', 'cloudflare.com']);
    expect(result.zones[0].keys.some((key) => key.role === 'KSK' && key.matchesParentDs)).toBe(true);
    expect(result.zones.every((zone) => zone.keySignatures.some((check) => check.valid))).toBe(true);
    expect(result.answer.signatures.some((check) => check.valid)).toBe(true);
  });

  it('proves an insecure delegation and an NXDOMAIN with signed NSEC/NSEC3 records', async () => {
    const insecure = await run('insecure');
    expect(insecure.zones.at(-1)).toMatchObject({ zone: 'google.com', delegation: 'insecure' });
    expect(insecure.zones.at(-1)?.denial?.kind).toBe('NSEC3');
    const missing = await run('nxdomainNsec');
    expect(missing.answer.denial).toMatchObject({ kind: 'NSEC', proven: true, nameExists: false });
  });

  it('turns bogus when a signature byte is flipped or the clock is outside the validity window', async () => {
    const flip = (key: string, packet: Buffer) => {
      if (!key.startsWith('cloudflare.com|1|1')) return packet;
      const address = decodeMessage(packet).answers.find((record) => record.typeCode === 1)!.rdata;
      const copy = Buffer.from(packet); copy[copy.indexOf(address) + 3] ^= 0x01; return copy;
    };
    expect((await run('secure', flip)).status).toBe('bogus');
    const entry = recorded.cases['secure'];
    const future = await inspectDnssec({ kind: 'dnssec-inspector', target: entry.target, recordType: 'A', resolver: '1.1.1.1' }, new AbortController().signal, () => {}, now + 400 * 86_400_000, replay(entry.packets));
    expect(future.status).toBe('bogus');
  });
});

describe('DNSSEC primitives', () => {
  it('derives the IANA root anchor DS from the recorded root DNSKEY', () => {
    const root = decodeMessage(Buffer.from(recorded.cases['secure'].packets['.|48|1'], 'base64'));
    const ksks = root.answers.filter((record) => record.typeCode === 48).map((record) => parseDnskey(record.rdata)).filter((key) => key.flags === 257);
    const anchor = ROOT_TRUST_ANCHORS[0];
    const ksk = ksks.find((key) => key.keyTag === anchor.keyTag)!;
    expect(ksk).toBeDefined();
    expect(keyTag(ksk.rdata)).toBe(20326);
    expect(dsDigest('', ksk.rdata, 2)).toBe(anchor.digest);
  });

  it('hashes NSEC3 owner names per the RFC 5155 Appendix A vector', () => {
    expect(nsec3Hash('example', Buffer.from('aabbccdd', 'hex'), 12)).toBe('0P9MHAVEQVM6T7VBL5LOP2U3T2RP3TOM');
    expect(nsec3Hash('a.example', Buffer.from('aabbccdd', 'hex'), 12)).toBe('35MTHGPGCU1QG68FAB165KLNSNK3DPVL');
    expect(() => nsec3Hash('x', Buffer.alloc(0), 10_000)).toThrow(/iteration/);
  });

  it('orders names canonically (RFC 4034 §6.1)', () => {
    const names = ['z.example', 'example', 'a.example', 'yljkjljk.a.example', 'Z.a.example', '*.z.example', '\\200.z.example'];
    const sorted = [...names].sort(compareNames);
    expect(sorted.slice(0, 4)).toEqual(['example', 'a.example', 'yljkjljk.a.example', 'Z.a.example']);
  });
});
