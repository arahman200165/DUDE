import { describe, expect, it } from 'vitest';
import { AsymmetricKeyGenRequest, EC_CURVES, RSA_MODULUS_LENGTHS, generateAsymmetricKeyPair } from "./asymmetric-keygen-logic.js";

// A real RSA-2048 private key this generator produced, frozen as a fixture (DUDE_PRD.md §21
// Phase 23 Item 3) -- independently cross-checked at authoring time, not re-run every test:
// `openssl pkey -in key.pem -text -noout` confirms a real 2048-bit RSA key, and
// `openssl dgst -sha256 -sign key.pem` / `-verify` with the matching public key round-trips
// ("Verified OK"), proving the PKCS#8 DER encoding this tool produces is fully standards-
// compliant and interoperable with an independent implementation, not just importable by
// DUDE's own code.
const OPENSSL_CROSS_CHECKED_RSA_2048_PRIVATE_KEY_PEM = `-----BEGIN PRIVATE KEY-----
MIIEvgIBADANBgkqhkiG9w0BAQEFAASCBKgwggSkAgEAAoIBAQDPp08Y8fFoKetU
2iQCKWmvQCdx5JsCc65RxNWU0mb26FpekgqaT/IWOoLGzz6z9hbsYd6kQK+XpDmj
aAKxZOeUfk6jwi8ysq9wULbKGz2cA23MXBbies+qXw7FhWvIygstnQIxeCcN/Nfm
ivn6xMYduAZiTCvO8gvLcvYhkPLQmrgk6BHbco+YAbW31540SowJBMWSDaK7gsGF
VQVSRurrds+kTYkJrQTm+23Y36ISuDXLoTVYlfwDNXBe7ZiN3dW7m7ugqrEOtndN
wtZTvJL0CBmCv3gEqpKaqX6izAfgTvYf5ECSGJc0aGmgyPXp+Sl62c4y8dlAZNAa
XYRjVHqJAgMBAAECggEAAbR5w3gk4MKz+/UcCsovoJd7T6QWxsoqrzIIpnzNCRn1
MXhUCBBUML3m4MbNy0/ZHqboVKiAyJZiSzD4swE7MwSCRCh56DTeiw5h+JKkDgS5
MGKvf/GbdxxVwDAroLSH/DprRfsGk7KdPv4V+XhK4WfMW4PyEWbSHBOj4pAk2gkx
f0RRJiOxN8SWrJo9jy1g5D5yCxnvRo9yOgQA+rhKK6Dwcgj39wUZRaN+SFTSd/Tf
HCOl7N0fyvShTfRffcGusPkTwttrfPqS40A1Lj9s58Yc8tKvrcvFjlulCkFRwgSR
SfbkFkil1un6Z4rYBogRkYx7NS0xl8X0D+jRABKJQQKBgQDuASIJ23dcr+SoLU/g
jdP6v2bkl8GtLJFvll/uSoRYd46yJvdICOEDLF5epo2etKlehEI9kKzDuK0IaFL6
l8R+oD//IKh2lQBucE0kyG/fj3qGYFMYi8skUkAKPZRLzbiAmNtrTDwIcQuJE6sw
3LAbmar9Ym/bMJqQTBAr/vMowwKBgQDfWrKadkQ33vDshha8xoSOgzi7/DXLqGO5
md1uLDbUse0wGxydJw0rfnS72YHB/tKXGTBQefDR5Kw9EYybvw41yySZ+jBJTypH
mK6T1NOdI2rgnGMrj96jJ2PU8Z3JtXAHQKOZuMrFdO1GyesYh253E2M8/v1epz4C
H+mOp5r6wwKBgQCt7awHUhffZzcNY9esvVi9NKSnxvMlb51004qVZGVlFTH1pR4u
yTZOkF0ChGqYIWRoivSxcwmeGlZw/3QsZz6UXt2Fv0L9LZRcILtvdv6yfHLIwpnX
JUm16FmeYjP+VX9QkuQ+fD6e2KXabcI7+frEoL7hXs9pehJqAvwKes0N6wKBgDU/
YiUA3PKU68r3jKQkj6WKExR95DVRR7UPwYJqeAftAybcz82HadRcqWe/Svf80CfF
kYceCxN++LD2ZhcbTT/11hv/UVOo0+ONutDzhB+KOgiiP+I6wlETKvGxSHS2FKcl
+drD+1NntMmTicCnSOaKcLYx9CWEqXvIL94ahxARAoGBAOOxJnQIvBIcMKhol6rR
IRZWHKL/Q0TdxlMmHPYQjH+agRyzZo7SoVOYIAw2b5l+QhXJSALQWsXEMGQZiqGC
5qv/GwCs1jKPRCQIq5iB8eJ3AuqUykdPG/UyMRX76FTtO+mzLll+MFuI+VhA+A0W
NnuBLXJVa56zYaeVIzhRE0HT
-----END PRIVATE KEY-----`;

function pemToArrayBuffer(pem: string): ArrayBuffer {
  const base64 = pem.replace(/-----[^-]+-----/g, '').replace(/\s+/g, '');
  return Uint8Array.from(atob(base64), (c) => c.charCodeAt(0)).buffer;
}

function base64urlDecode(input: string): Uint8Array {
  const padded = input.replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(input.length / 4) * 4, '=');
  const binary = atob(padded);
  return Uint8Array.from(binary, (c) => c.charCodeAt(0));
}

describe('asymmetric-keygen-logic', () => {
  for (const modulusLength of RSA_MODULUS_LENGTHS) {
    it(`generates an RSA-${modulusLength} key pair with PEM and JWK output`, async () => {
      const pair = await generateAsymmetricKeyPair({ family: 'rsa', modulusLength });
      expect(pair.detail).toBe(`RSA-${modulusLength}`);
      expect(pair.publicKeyPem).toMatch(/-----BEGIN PUBLIC KEY-----/);
      expect(pair.privateKeyPem).toMatch(/-----BEGIN PRIVATE KEY-----/);

      const publicJwk = JSON.parse(pair.publicKeyJwk);
      expect(publicJwk.kty).toBe('RSA');
      const modulusBytes = base64urlDecode(publicJwk.n);
      // Modulus may include a leading zero byte if the high bit is set; allow +/-8 bits of slack.
      expect(Math.abs(modulusBytes.length * 8 - modulusLength)).toBeLessThanOrEqual(8);
    });
  }

  for (const curve of EC_CURVES) {
    it(`generates a ${curve} EC key pair with PEM and JWK output`, async () => {
      const request: AsymmetricKeyGenRequest = { family: 'ec', curve };
      const pair = await generateAsymmetricKeyPair(request);
      expect(pair.detail).toBe(curve);
      expect(pair.publicKeyPem).toMatch(/-----BEGIN PUBLIC KEY-----/);
      expect(pair.privateKeyPem).toMatch(/-----BEGIN PRIVATE KEY-----/);

      const publicJwk = JSON.parse(pair.publicKeyJwk);
      expect(publicJwk.kty).toBe('EC');
      expect(publicJwk.crv).toBe(curve);
    });
  }

  it('generates an Ed25519 key pair with PEM and JWK output', async () => {
    const pair = await generateAsymmetricKeyPair({ family: 'ed25519' });
    expect(pair.detail).toBe('Ed25519');
    expect(pair.publicKeyPem).toMatch(/-----BEGIN PUBLIC KEY-----/);
    expect(pair.privateKeyPem).toMatch(/-----BEGIN PRIVATE KEY-----/);

    const publicJwk = JSON.parse(pair.publicKeyJwk);
    expect(publicJwk.kty).toBe('OKP');
    expect(publicJwk.crv).toBe('Ed25519');
  });

  it('defaults to RSA-2048 when no modulus length is given', async () => {
    const pair = await generateAsymmetricKeyPair({ family: 'rsa' });
    expect(pair.detail).toBe('RSA-2048');
  });

  it('defaults to P-256 when no curve is given', async () => {
    const pair = await generateAsymmetricKeyPair({ family: 'ec' });
    expect(pair.detail).toBe('P-256');
  });

  it('produces a different key pair on each call', async () => {
    const a = await generateAsymmetricKeyPair({ family: 'ed25519' });
    const b = await generateAsymmetricKeyPair({ family: 'ed25519' });
    expect(a.privateKeyPem).not.toBe(b.privateKeyPem);
  });

  it("re-imports an openssl-cross-checked RSA-2048 private key this generator previously produced", async () => {
    const key = await crypto.subtle.importKey(
      'pkcs8',
      pemToArrayBuffer(OPENSSL_CROSS_CHECKED_RSA_2048_PRIVATE_KEY_PEM),
      { name: 'RSA-PSS', hash: 'SHA-256' },
      true,
      ['sign'],
    );
    const jwk = await crypto.subtle.exportKey('jwk', key);
    expect(jwk.kty).toBe('RSA');
    // 256-byte modulus (2048 bits), allowing the leading-zero-byte slack the RSA_MODULUS_LENGTHS
    // test above also allows.
    const modulusBytes = Uint8Array.from(atob(jwk.n!.replace(/-/g, '+').replace(/_/g, '/')), (c) => c.charCodeAt(0));
    expect(Math.abs(modulusBytes.length * 8 - 2048)).toBeLessThanOrEqual(8);
  });
});
