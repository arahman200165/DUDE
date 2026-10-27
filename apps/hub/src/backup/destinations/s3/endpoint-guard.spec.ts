import { describe, expect, it } from 'vitest';
import type { LookupAddress } from 'node:dns';
import { DestinationError } from '../destination.js';
import { S3Client } from './s3-client.js';
import { assertAddressAllowed, assertHostAllowed, classifyAddress, guardedLookup } from './endpoint-guard.js';
import type { AddressClass } from './endpoint-guard.js';

const CREDENTIALS = { accessKeyId: 'AKIDEXAMPLE', secretAccessKey: 'secret' };
const badEndpoint = expect.objectContaining({ code: 'bad-endpoint' });

describe('classifyAddress', () => {
  const cases: Array<[string, AddressClass]> = [
    // Public.
    ['8.8.8.8', 'public'], ['1.1.1.1', 'public'], ['52.216.0.1', 'public'], ['172.15.255.255', 'public'], ['172.32.0.1', 'public'], ['100.63.255.255', 'public'], ['100.128.0.1', 'public'],
    ['2606:4700:4700::1111', 'public'], ['2a00:1450::1', 'public'],
    // Private: loopback, RFC 1918, CGNAT, special-use, IPv6 loopback / unique-local.
    ['127.0.0.1', 'private'], ['127.255.255.254', 'private'], ['10.0.0.1', 'private'], ['172.16.0.1', 'private'], ['172.31.255.255', 'private'], ['192.168.1.10', 'private'],
    ['100.64.0.1', 'private'], ['100.127.255.255', 'private'], ['192.0.0.1', 'private'], ['198.18.0.1', 'private'], ['198.19.255.255', 'private'], ['192.0.2.1', 'private'], ['198.51.100.1', 'private'], ['203.0.113.1', 'private'],
    ['::1', 'private'], ['fc00::1', 'private'], ['fd12:3456::1', 'private'], ['2001:db8::1', 'private'], ['[::1]', 'private'],
    // Forbidden: link-local and metadata, unspecified, multicast, broadcast.
    ['169.254.169.254', 'forbidden'], ['169.254.0.1', 'forbidden'], ['168.63.129.16', 'forbidden'], ['100.100.100.200', 'forbidden'], ['0.0.0.0', 'forbidden'], ['0.1.2.3', 'forbidden'],
    ['224.0.0.1', 'forbidden'], ['239.255.255.250', 'forbidden'], ['255.255.255.255', 'forbidden'],
    ['::', 'forbidden'], ['fe80::1', 'forbidden'], ['febf::1', 'forbidden'], ['fd00:ec2::254', 'forbidden'], ['ff02::1', 'forbidden'],
    // Unparseable.
    ['', 'forbidden'], ['not-an-ip', 'forbidden'], ['999.1.1.1', 'forbidden'], ['example.com', 'forbidden'],
  ];
  it.each(cases)('%s is %s', (address, expected) => {
    expect(classifyAddress(address)).toBe(expected);
  });

  it('classifies IPv4-mapped and NAT64 IPv6 addresses by the embedded IPv4 address', () => {
    expect(classifyAddress('::ffff:169.254.169.254')).toBe('forbidden');
    expect(classifyAddress('::ffff:a9fe:a9fe')).toBe('forbidden');
    expect(classifyAddress('::ffff:127.0.0.1')).toBe('private');
    expect(classifyAddress('::ffff:10.1.2.3')).toBe('private');
    expect(classifyAddress('::ffff:8.8.8.8')).toBe('public');
    expect(classifyAddress('64:ff9b::a9fe:a9fe')).toBe('forbidden');
    expect(classifyAddress('64:ff9b::808:808')).toBe('public');
  });
});

describe('assertAddressAllowed and assertHostAllowed', () => {
  it('never allows a forbidden address, even with allowPrivateNetwork', () => {
    for (const address of ['169.254.169.254', 'fe80::1', 'fd00:ec2::254', '0.0.0.0', '168.63.129.16']) {
      for (const allowPrivateNetwork of [false, true]) {
        expect(() => assertAddressAllowed(address, { allowPrivateNetwork })).toThrow(badEndpoint);
      }
    }
  });

  it('allows a private address only with allowPrivateNetwork, and a public one always', () => {
    expect(() => assertAddressAllowed('192.168.1.5', { allowPrivateNetwork: false })).toThrow(badEndpoint);
    expect(() => assertAddressAllowed('192.168.1.5', { allowPrivateNetwork: true })).not.toThrow();
    expect(() => assertAddressAllowed('::1', { allowPrivateNetwork: false })).toThrow(DestinationError);
    expect(() => assertAddressAllowed('8.8.8.8', { allowPrivateNetwork: false })).not.toThrow();
  });

  it('refusal messages name the class, never the address', () => {
    for (const address of ['169.254.169.254', '10.9.8.7']) {
      try { assertAddressAllowed(address, { allowPrivateNetwork: false }); expect.unreachable(); } catch (error) {
        expect((error as Error).message).not.toContain(address);
      }
    }
  });

  it('checks literal-IP hosts (bracketed IPv6 too) and leaves names to the resolver', () => {
    expect(() => assertHostAllowed('10.0.0.1', { allowPrivateNetwork: false })).toThrow(DestinationError);
    expect(() => assertHostAllowed('[::1]', { allowPrivateNetwork: false })).toThrow(DestinationError);
    expect(() => assertHostAllowed('[::1]', { allowPrivateNetwork: true })).not.toThrow();
    expect(() => assertHostAllowed('169.254.169.254', { allowPrivateNetwork: true })).toThrow(DestinationError);
    expect(() => assertHostAllowed('localhost', { allowPrivateNetwork: false })).not.toThrow();
    expect(() => assertHostAllowed('s3.example.com', { allowPrivateNetwork: false })).not.toThrow();
  });
});

describe('guardedLookup (the per-connection DNS check)', () => {
  const run = (policy: { allowPrivateNetwork: boolean }, answers: LookupAddress[] | Error, options: { all?: boolean } = {}): Promise<{ error: Error | null; address: unknown; family: number | undefined }> => {
    const lookup = guardedLookup(policy, () => (answers instanceof Error ? Promise.reject(answers) : Promise.resolve(answers)));
    return new Promise((resolve) => lookup('s3.example.com', options, (error, address, family) => resolve({ error, address, family })));
  };

  it('hands the socket the first address of an all-public answer', async () => {
    const out = await run({ allowPrivateNetwork: false }, [{ address: '52.1.2.3', family: 4 }, { address: '52.1.2.4', family: 4 }]);
    expect(out).toEqual({ error: null, address: '52.1.2.3', family: 4 });
    const all = await run({ allowPrivateNetwork: false }, [{ address: '52.1.2.3', family: 4 }], { all: true });
    expect(all.address).toEqual([{ address: '52.1.2.3', family: 4 }]);
  });

  it('refuses a name that resolves to a metadata address (rebinding), and one that mixes public and metadata', async () => {
    const meta = await run({ allowPrivateNetwork: true }, [{ address: '169.254.169.254', family: 4 }]);
    expect(meta.error).toMatchObject({ code: 'bad-endpoint' });
    const mixed = await run({ allowPrivateNetwork: true }, [{ address: '52.1.2.3', family: 4 }, { address: '169.254.169.254', family: 4 }]);
    expect(mixed.error).toMatchObject({ code: 'bad-endpoint' });
  });

  it('refuses a private answer unless allowed', async () => {
    expect((await run({ allowPrivateNetwork: false }, [{ address: '10.0.0.5', family: 4 }])).error).toMatchObject({ code: 'bad-endpoint' });
    expect((await run({ allowPrivateNetwork: true }, [{ address: '10.0.0.5', family: 4 }])).error).toBeNull();
  });

  it('maps an empty answer and a resolver failure to a value-free network error', async () => {
    expect((await run({ allowPrivateNetwork: false }, [])).error).toMatchObject({ code: 'network' });
    const failed = await run({ allowPrivateNetwork: false }, new Error('getaddrinfo ENOTFOUND secret-host.internal'));
    expect(failed.error).toMatchObject({ code: 'network' });
    expect(failed.error?.message).not.toContain('secret-host');
  });
});

describe('the S3 client endpoint rules (https only, private network opt-in)', () => {
  const build = (endpoint: string, allowPrivateNetwork?: boolean): S3Client => new S3Client({
    endpoint, region: 'us-east-1', bucket: 'backups', credentials: CREDENTIALS, ...(allowPrivateNetwork !== undefined ? { allowPrivateNetwork } : {}),
  });

  it('accepts a public https endpoint', () => {
    expect(() => build('https://s3.us-east-1.amazonaws.com')).not.toThrow();
    expect(() => build('https://minio.example.com:9000')).not.toThrow();
  });

  it('refuses plain http for a public host, and for loopback unless allowPrivateNetwork is set', () => {
    expect(() => build('http://s3.example.com')).toThrow(badEndpoint);
    expect(() => build('http://s3.example.com', true)).toThrow(badEndpoint);
    expect(() => build('http://127.0.0.1:9000')).toThrow(badEndpoint);
    expect(() => build('http://127.0.0.1:9000', true)).not.toThrow();
    expect(() => build('http://localhost:9000', true)).not.toThrow();
  });

  it('refuses a literal private or loopback https endpoint without allowPrivateNetwork', () => {
    expect(() => build('https://127.0.0.1')).toThrow(badEndpoint);
    expect(() => build('https://192.168.1.20:9000')).toThrow(badEndpoint);
    expect(() => build('https://[::1]:9000')).toThrow(badEndpoint);
    expect(() => build('https://192.168.1.20:9000', true)).not.toThrow();
  });

  it('always refuses the metadata addresses, even with allowPrivateNetwork', () => {
    for (const endpoint of ['https://169.254.169.254', 'https://[fd00:ec2::254]', 'https://168.63.129.16', 'https://100.100.100.200', 'https://[fe80::1]']) {
      expect(() => build(endpoint, true), endpoint).toThrow(badEndpoint);
      expect(() => build(endpoint), endpoint).toThrow(badEndpoint);
    }
  });

  it('refuses malformed endpoints, endpoints with credentials, paths or queries, and never echoes the value', () => {
    for (const endpoint of ['', 'not a url', 'ftp://s3.example.com', 'https://user:hunter2@s3.example.com', 'https://s3.example.com/path', 'https://s3.example.com/?x=1', 'file:///etc/passwd']) {
      try { build(endpoint); expect.unreachable(endpoint); } catch (error) {
        expect(error).toMatchObject({ code: 'bad-endpoint' });
        expect((error as Error).message).not.toContain('hunter2');
        expect((error as Error).message).not.toContain('/etc/passwd');
      }
    }
  });
});
