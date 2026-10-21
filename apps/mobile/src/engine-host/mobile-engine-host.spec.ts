import { describe, expect, it } from 'vitest';
import { HostFacilityUnavailableError, hostCompression, hostCrypto, hostDecodeImage, hostFetch, hostHtmlEntities, hostSanitizeHtml, hostXxhash } from '@dude/crypto/host';
import { installCryptoPolyfill } from './crypto-polyfill';
import { runCapabilityProbe } from './capability-probe';
import { createMobileCrypto, installMobileEngineHost } from './mobile-engine-host';

const hex = (buffer: ArrayBuffer) => [...new Uint8Array(buffer)].map(byte => byte.toString(16).padStart(2, '0')).join('');
const text = (value: string) => new TextEncoder().encode(value);
const subtle = createMobileCrypto().subtle;

describe('mobile engine host subtle subset', () => {
  // FIPS 180-4 / NIST example vectors for "abc".
  it('digests SHA-1, SHA-256, SHA-384 and SHA-512', async () => {
    expect(hex(await subtle.digest('SHA-1', text('abc')))).toBe('a9993e364706816aba3e25717850c26c9cd0d89d');
    expect(hex(await subtle.digest('SHA-256', text('abc')))).toBe('ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
    expect(hex(await subtle.digest({ name: 'SHA-384' }, text('abc')))).toBe('cb00753f45a35e8bb5a03d699ac65007272c32ab0eded1631a8b605a43ff5bed8086072ba1e7cc2358baeca134c825a7');
    expect(hex(await subtle.digest('SHA-512', text('abc')))).toBe('ddaf35a193617abacc417349ae20413112e6fa4e89a97ea20a9eeee64b55d39a2192992a274fc1a836ba3c23a3feebbd454d4423643ce80e2a9ac94fa54ca49f');
  });

  // RFC 4231 test case 1: key = 0x0b * 20, data = "Hi There".
  it('computes and verifies HMAC (RFC 4231 test case 1)', async () => {
    const key = await subtle.importKey('raw', new Uint8Array(20).fill(0x0b), { name: 'HMAC', hash: { name: 'SHA-256' } }, false, ['sign', 'verify']);
    const signature = await subtle.sign('HMAC', key, text('Hi There'));
    expect(hex(signature)).toBe('b0344c61d8db38535ca8afceaf0bf12b881dc200c9833da726e9376c2e32cff7');
    expect(await subtle.verify('HMAC', key, signature, text('Hi There'))).toBe(true);
    expect(await subtle.verify('HMAC', key, signature, text('Hi there'))).toBe(false);
    const sha512 = await subtle.importKey('raw', new Uint8Array(20).fill(0x0b), { name: 'HMAC', hash: 'SHA-512' }, false, ['sign']);
    expect(hex(await subtle.sign('HMAC', sha512, text('Hi There')))).toBe('87aa7cdea5ef619d4ff0b4241a1d6cb02379f4e2ce4ec2787ad0b30545e17cdedaa833b7d6b8a702038b274eaea3f4e4be9d914eeb61f1702e696c203a126854');
  });

  it('supports HMAC-SHA1 and HMAC-SHA384', async () => {
    // RFC 2202 test case 1 (SHA-1) and RFC 4231 test case 1 (SHA-384).
    const sha1 = await subtle.importKey('raw', new Uint8Array(20).fill(0x0b), { name: 'HMAC', hash: 'SHA-1' }, false, ['sign']);
    expect(hex(await subtle.sign('HMAC', sha1, text('Hi There')))).toBe('b617318655057264e28bc0b6fb378c8ef146be00');
    const sha384 = await subtle.importKey('raw', new Uint8Array(20).fill(0x0b), { name: 'HMAC', hash: 'SHA-384' }, false, ['sign']);
    expect(hex(await subtle.sign('HMAC', sha384, text('Hi There')))).toBe('afd03944d84895626b0825f4ab46907f15f9dadbe4101ec682aa034c7cebc59cfaea9ea9076ede7f4af152e8b2fa9cb6');
  });

  it('rejects other subtle operations and algorithms explicitly', async () => {
    for (const call of [
      () => subtle.encrypt('AES-GCM', {} as CryptoKey, new Uint8Array(1)), () => subtle.decrypt('AES-GCM', {} as CryptoKey, new Uint8Array(1)),
      () => subtle.generateKey('AES-GCM', true, ['encrypt']), () => subtle.deriveBits('PBKDF2', {} as CryptoKey, 8), () => subtle.exportKey('raw', {} as CryptoKey),
      () => subtle.digest('MD5', text('abc')), () => subtle.importKey('raw', new Uint8Array(1), 'AES-GCM', false, ['encrypt']),
      () => subtle.importKey('jwk', {} as JsonWebKey, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']),
    ]) await expect(call()).rejects.toBeInstanceOf(HostFacilityUnavailableError);
  });
});

describe('mobile engine host ports', () => {
  it('installs once and serves crypto while Hermes-missing facilities fail explicitly', async () => {
    installMobileEngineHost();
    installMobileEngineHost();
    expect(hex(await hostCrypto().subtle.digest('SHA-256', text('abc')))).toMatch(/^ba7816bf/);
    expect(hostCrypto().getRandomValues(new Uint8Array(4))).toHaveLength(4);
    expect(hostCrypto().randomUUID()).toMatch(/^[0-9a-f-]{36}$/);
    await expect(hostFetch('https://example.invalid')).rejects.toBeInstanceOf(HostFacilityUnavailableError);
    await expect(hostDecodeImage(new Uint8Array(1), 'image/png')).rejects.toBeInstanceOf(HostFacilityUnavailableError);
    await expect(hostXxhash()).rejects.toBeInstanceOf(HostFacilityUnavailableError);
    expect(() => hostCompression('gzip')).toThrow(HostFacilityUnavailableError);
    expect(() => hostSanitizeHtml('<b>x</b>')).toThrow(HostFacilityUnavailableError);
    expect(() => hostHtmlEntities('&amp;', 'decode')).toThrow(HostFacilityUnavailableError);
  });
});

describe('crypto polyfill', () => {
  const source = { getRandomValues: <T extends ArrayBufferView>(array: T) => array, randomUUID: () => 'polyfilled' };
  it('never overwrites a native implementation', () => {
    const native = { getRandomValues: () => 'native-random', randomUUID: () => 'native-uuid' };
    const target = { crypto: native };
    installCryptoPolyfill(source, target);
    expect(target.crypto).toBe(native);
    expect(native.getRandomValues()).toBe('native-random');
    expect(native.randomUUID()).toBe('native-uuid');
  });
  it('fills only the missing members, creating crypto when absent', () => {
    const partial = { getRandomValues: () => 'native-random' } as { getRandomValues: () => string; randomUUID?: () => string };
    installCryptoPolyfill(source, { crypto: partial });
    expect(partial.getRandomValues()).toBe('native-random');
    expect(partial.randomUUID?.()).toBe('polyfilled');
    const empty: { crypto?: { randomUUID(): string } } = {};
    installCryptoPolyfill(source, empty);
    expect(empty.crypto?.randomUUID()).toBe('polyfilled');
  });
});

describe('capability probe', () => {
  it('reports every facility without throwing', async () => {
    const report = await runCapabilityProbe();
    expect(report.map(entry => entry.name)).toEqual(expect.arrayContaining(['textencoder', 'textdecoder', 'textdecoder-fatal', 'url', 'urlsearchparams', 'getrandomvalues', 'randomuuid', 'subtle-digest', 'intl-timezone', 'intl-segmenter', 'intl-supportedvaluesof', 'intl-relativetimeformat', 'normalize', 'atob-btoa', 'structuredclone', 'webassembly', 'bigint']));
    expect(report.filter(entry => !entry.ok)).toEqual([]);
  });
  it('marks facilities missing from an empty environment', async () => {
    const report = await runCapabilityProbe({});
    expect(report.find(entry => entry.name === 'textencoder')?.ok).toBe(false);
    expect(report.find(entry => entry.name === 'webassembly')?.ok).toBe(false);
  });
});
