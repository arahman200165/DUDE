import { describe, expect, it } from 'vitest';
import {
  SSH_EC_CURVES,
  SSH_RSA_MODULUS_LENGTHS,
  generateSshKeyPair,
  md5Fingerprint,
  parseSshPublicKey,
  sha256Fingerprint,
} from "./ssh-key-logic.js";

/**
 * Real keys generated with `ssh-keygen` (OpenSSH_for_Windows, Ed25519/RSA-2048/
 * ECDSA P-256), with their fingerprints read back via
 * `ssh-keygen -lf` / `ssh-keygen -E md5 -lf` — cross-validating this module's
 * hand-rolled mpint encoding and fingerprint calculation against a real,
 * independent implementation rather than only against itself.
 */
const ED25519_PUBLIC_KEY_LINE =
  'ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIBR8IP4fiAzJIL3yQzSCbMkBs7kgfIXr+HESB8pwffqX test@dude';
const ED25519_SHA256 = 'SHA256:W8kEG5t2IE+rGekMCRndUoHJpu+xNTP4oOoly9yiNZo';
const ED25519_MD5 = '4a:55:d7:70:fb:35:59:e7:d7:60:e9:83:e4:fb:f1:eb';

const RSA_PUBLIC_KEY_LINE =
  'ssh-rsa AAAAB3NzaC1yc2EAAAADAQABAAABAQDTQfW7o4lmLk8LXrhtU4+p7qSMYP9DiEEIOQ0PttDxfXgmqbSfa73Z6jd04orO2rDmIvWUooFVpFipKqlV5u7hl1mIeP0ovYRbzwEU9NIZ6n/zGgsvq5UAPRUg/Shr75Ni/rzmuDKYmQAK25YhyncYWq94U0oPziEQBKPt2nKNO2RsegVyHIftaYFeiOkUezLBSr8Pqq8kOsRHLxXYHYw2whipLeFYPpysD1ezxZt11eAwR6qCzkBqXn2VYq7m1qKVm6hXkLSW7nKd2y0I0XsQMCY1NRkiNo60f4UnAg3d0btHlqDBQh2wnE2GQ8uJWYRQZBx+dMjGFlTbqr1sk/F1 test@dude';
const RSA_SHA256 = 'SHA256:/wvoeGcvtoshT/PwUeMZBuaVgsU2iu/y/Mt9PKDs9WI';
const RSA_MD5 = 'a6:49:f6:43:9a:24:84:0f:40:96:cc:82:21:65:a1:5d';

const ECDSA_P256_PUBLIC_KEY_LINE =
  'ecdsa-sha2-nistp256 AAAAE2VjZHNhLXNoYTItbmlzdHAyNTYAAAAIbmlzdHAyNTYAAABBBGvaxYAv6NbpfRW8/3WadT5GpAKiRXqgY/9jcD+mKGzLVeS7XzTIgTIrdWd+aBFhpZQc3NXsNKCb/NZgMa1u8sk= test@dude';
const ECDSA_P256_SHA256 = 'SHA256:TGjrgRIZ6uusH5KKLZYJiLmz8FZJaConHLz3jAX38Uk';
const ECDSA_P256_MD5 = '57:33:3e:59:2c:7d:fd:3b:81:c0:3a:04:02:4f:06:2a';

describe('ssh-key-logic', () => {
  describe('parseSshPublicKey + fingerprints, cross-checked against real ssh-keygen output', () => {
    it('parses an Ed25519 key and matches ssh-keygen fingerprints', async () => {
      const result = parseSshPublicKey(ED25519_PUBLIC_KEY_LINE);
      expect(result.ok).toBe(true);
      if (!result.ok) throw new Error(result.error);
      expect(result.key.type).toBe('ssh-ed25519');
      expect(result.key.comment).toBe('test@dude');

      expect(await sha256Fingerprint(result.key.blob)).toBe(ED25519_SHA256);
      expect(md5Fingerprint(result.key.blob)).toBe(ED25519_MD5);
    });

    it('parses an RSA-2048 key, reports the correct modulus bit length, and matches ssh-keygen fingerprints', async () => {
      const result = parseSshPublicKey(RSA_PUBLIC_KEY_LINE);
      expect(result.ok).toBe(true);
      if (!result.ok) throw new Error(result.error);
      expect(result.key.type).toBe('ssh-rsa');
      expect(result.key.details).toEqual(
        expect.arrayContaining([expect.objectContaining({ label: 'Modulus (n) bits', value: '2048' })]),
      );

      expect(await sha256Fingerprint(result.key.blob)).toBe(RSA_SHA256);
      expect(md5Fingerprint(result.key.blob)).toBe(RSA_MD5);
    });

    it('parses an ECDSA P-256 key and matches ssh-keygen fingerprints', async () => {
      const result = parseSshPublicKey(ECDSA_P256_PUBLIC_KEY_LINE);
      expect(result.ok).toBe(true);
      if (!result.ok) throw new Error(result.error);
      expect(result.key.type).toBe('ecdsa-sha2-nistp256');
      expect(result.key.details).toEqual(expect.arrayContaining([expect.objectContaining({ label: 'Curve', value: 'nistp256' })]));

      expect(await sha256Fingerprint(result.key.blob)).toBe(ECDSA_P256_SHA256);
      expect(md5Fingerprint(result.key.blob)).toBe(ECDSA_P256_MD5);
    });
  });

  describe('parseSshPublicKey error handling', () => {
    it('rejects an empty line', () => {
      expect(parseSshPublicKey('   ').ok).toBe(false);
    });

    it('rejects a line missing the base64 body', () => {
      expect(parseSshPublicKey('ssh-rsa').ok).toBe(false);
    });

    it('rejects invalid Base64', () => {
      expect(parseSshPublicKey('ssh-rsa not-valid-base64!!! comment').ok).toBe(false);
    });

    it('rejects a declared type that does not match the blob', () => {
      const [, base64, comment] = RSA_PUBLIC_KEY_LINE.split(' ');
      const result = parseSshPublicKey(`ssh-ed25519 ${base64} ${comment}`);
      expect(result.ok).toBe(false);
      expect(result.ok || result.error).toMatch(/does not match/i);
    });

    it('rejects an unsupported key type', () => {
      // A well-formed blob (valid string framing) but with an unsupported type name.
      const type = 'ssh-dss';
      const typeBytes = new TextEncoder().encode(type);
      const len = new Uint8Array(4);
      new DataView(len.buffer).setUint32(0, typeBytes.length);
      const blob = new Uint8Array([...len, ...typeBytes]);
      let binary = '';
      for (const b of blob) binary += String.fromCharCode(b);
      const result = parseSshPublicKey(`${type} ${btoa(binary)} comment`);
      expect(result.ok).toBe(false);
      expect(result.ok || result.error).toMatch(/unsupported/i);
    });
  });

  describe('generateSshKeyPair', () => {
    for (const modulusLength of SSH_RSA_MODULUS_LENGTHS) {
      it(`generates an RSA-${modulusLength} key whose public line round-trips through parseSshPublicKey`, async () => {
        const generated = await generateSshKeyPair({ family: 'rsa', modulusLength, comment: 'roundtrip@test' });
        expect(generated.publicKeyLine.startsWith('ssh-rsa ')).toBe(true);
        expect(generated.publicKeyLine.endsWith('roundtrip@test')).toBe(true);
        expect(generated.privateKeyPem).toMatch(/-----BEGIN PRIVATE KEY-----/);

        const parsed = parseSshPublicKey(generated.publicKeyLine);
        expect(parsed.ok).toBe(true);
        if (!parsed.ok) throw new Error(parsed.error);
        expect(parsed.key.details).toEqual(
          expect.arrayContaining([expect.objectContaining({ label: 'Modulus (n) bits', value: String(modulusLength) })]),
        );
        expect(await sha256Fingerprint(parsed.key.blob)).toBe(generated.fingerprintSha256);
      });
    }

    for (const curve of SSH_EC_CURVES) {
      it(`generates a ${curve} EC key whose public line round-trips through parseSshPublicKey`, async () => {
        const generated = await generateSshKeyPair({ family: 'ec', curve });
        const parsed = parseSshPublicKey(generated.publicKeyLine);
        expect(parsed.ok).toBe(true);
        if (!parsed.ok) throw new Error(parsed.error);
        expect(parsed.key.type).toBe(generated.publicKeyLine.split(' ')[0]);
      });
    }

    it('generates an Ed25519 key whose public line round-trips through parseSshPublicKey', async () => {
      const generated = await generateSshKeyPair({ family: 'ed25519' });
      const parsed = parseSshPublicKey(generated.publicKeyLine);
      expect(parsed.ok).toBe(true);
      if (!parsed.ok) throw new Error(parsed.error);
      expect(parsed.key.type).toBe('ssh-ed25519');
      expect(generated.fingerprintSha256).toMatch(/^SHA256:[A-Za-z0-9+/]+$/);
      expect(generated.fingerprintSha256).not.toMatch(/=/);
    });

    it('omits the comment from the public key line when none is given', async () => {
      const generated = await generateSshKeyPair({ family: 'ed25519' });
      expect(generated.publicKeyLine.trim().split(/\s+/)).toHaveLength(2);
    });
  });
});
