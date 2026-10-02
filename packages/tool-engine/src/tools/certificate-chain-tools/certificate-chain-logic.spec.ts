import { describe, expect, it } from 'vitest';
import { assembleBundle, linkChain, splitPemBundle, verifyChain } from "./certificate-chain-logic.js";

/**
 * A real 3-certificate chain (leaf -> intermediate CA -> self-signed root
 * CA) built with `openssl req -x509` / `openssl x509 -req -CA`, whose
 * validity `openssl verify -CAfile <inter+root> leaf.pem` confirms as
 * "leaf.pem: OK" — cross-validating this module's `verifyChain` against a
 * real, independent chain-validation implementation.
 */
const LEAF_PEM = `-----BEGIN CERTIFICATE-----
MIIDfDCCAmSgAwIBAgIUOwqWksQAOqU8v4u5jJnrHKmSIv0wDQYJKoZIhvcNAQEL
BQAwMjEdMBsGA1UEAwwUVGVzdCBJbnRlcm1lZGlhdGUgQ0ExETAPBgNVBAoMCFRl
c3QgT3JnMB4XDTI2MDkyMzAyMTUyN1oXDTI4MTIyNjAyMTUyN1owLjEZMBcGA1UE
AwwQbGVhZi5leGFtcGxlLm9yZzERMA8GA1UECgwIVGVzdCBPcmcwggEiMA0GCSqG
SIb3DQEBAQUAA4IBDwAwggEKAoIBAQDAnTGZTc/KjJN2Qxf4z/5+z++FF5PU3a8X
q5+zRe0nkIlMLosPbCNrXIqeGno/Mxlep7BjYqyrgYWCjDnKkOTXp4bXP0zl8aRY
03Ye8nxPOj6lPXOIPfl88ZQL+c4dd6QohHKwc10CG2cqaplx6jY4HYW+VwYNq4PE
QjD5Pi6OEVA8QqvdSgn6NWNSHUCo9VFQYtE5mDQo0eVhhaABb0hizT0+6HUXMQE3
y4tDBtD4RFHUNHSrhcO7oLpv8Uli1d/eCV8UeuoWAlqOslGZl1i971reaKqwsFvM
TrtB6wDKjO5QEXafuaWA4FtvFdrD+RmjlOyCpFwBQvK8LC6SOT3DAgMBAAGjgY0w
gYowCQYDVR0TBAIwADALBgNVHQ8EBAMCBaAwEwYDVR0lBAwwCgYIKwYBBQUHAwEw
GwYDVR0RBBQwEoIQbGVhZi5leGFtcGxlLm9yZzAdBgNVHQ4EFgQUef63th8vafry
9J9HQn6YrIslt2MwHwYDVR0jBBgwFoAUVY+kEGPsjT4uJhvZkfIQFLFdsb0wDQYJ
KoZIhvcNAQELBQADggEBAGLxd3wl/zNWymUGarjw/2MXNVX4uyhXJK6XpUUEAsYq
qz/GJz0Xgi1fwKGwXHlGLLcxlewN7GpJl1krkOc+UXwxjsIEU4XWJI9RccBAl8zc
b+f20mK2Oi0E2d2rx+OsZr/QDhIEaS/uAu73LRHVgFKBNlce9a8/8ZBk4Hcziae3
87fIyO6keyNbixAZ/YRXMoRBidoymU6VSsm4AVp1Duvx5I7dU0h/YsrE5/jVrP9F
acT/6wZ8Y+z488ctuviEr3GKO3tFbYd/l3xDS9jeCfocLGrbdXc0Kjwqglye+PY7
IuZ6ptdY6oZXyPNmovRgonQ8Z4pR2wgugqQWEY/fcv8=
-----END CERTIFICATE-----`;

const INTER_PEM = `-----BEGIN CERTIFICATE-----
MIIDUDCCAjigAwIBAgIUb4QlCCCwG/1r/bMECMoGc5FhmUYwDQYJKoZIhvcNAQEL
BQAwKjEVMBMGA1UEAwwMVGVzdCBSb290IENBMREwDwYDVQQKDAhUZXN0IE9yZzAe
Fw0yNjA5MjMwMjE1MjdaFw0zMTA5MjIwMjE1MjdaMDIxHTAbBgNVBAMMFFRlc3Qg
SW50ZXJtZWRpYXRlIENBMREwDwYDVQQKDAhUZXN0IE9yZzCCASIwDQYJKoZIhvcN
AQEBBQADggEPADCCAQoCggEBALenYx7+GjuV8zx2O+k7ZYxmhIYR5LVtIepmaCHA
gEmrsotbm1SBsqQ/7PjWZzQQ0Z6Z/Nzd0lP4YhuKjVMLJmdF7WxLEH/17NcHFuIC
H/BzW6578VG3Q7HseIKPFdcfs3mH9LMPcMwqdY0kiVV18Wx8XE8R3FZ2vPKl0zVA
IRXB33z+Nx+HfHtONRjEog4uZXqgwwRrUrp2Dmi2DCWe731gByCpl2fmcPYNOmmh
D0Ma3mO3dsupuAt+0Y6k4w1KFpPcVoRQY5WUgkT7QO4dhk23GZJi9Hcrb0X42pPd
UUeev/NFKkGFgxGM+fBCsqqh+MxSTOSDr86aQoOOlXnBEpcCAwEAAaNmMGQwEgYD
VR0TAQH/BAgwBgEB/wIBADAOBgNVHQ8BAf8EBAMCAQYwHQYDVR0OBBYEFFWPpBBj
7I0+LiYb2ZHyEBSxXbG9MB8GA1UdIwQYMBaAFK7gF/uTu69g9Kp4ysdpyJyLgpRO
MA0GCSqGSIb3DQEBCwUAA4IBAQBFKcoXCcyfUkEbGSCJsB6LljwK6y3qe5ETBm99
+KMFToxTIadRpeIjW7nuQiDBP8dPg9nHLc0O7nJPnxjrkAp3axmMoz0CyFDSBDX4
McV2MgMAPP4TfSOj8ortudWv4JIHJ4P2buCpRwirArHbwDEFTl6tb6QGwfbte4PP
iFt/hGK11DdgNjBUHxAdhqkBLOeyUpcRa3RP3wYt5yixq+NNUDcY+myrD5/DXCgS
nfNazk/36PDBqBfX4uDyFB9qppdVUEADDd32jp9wiYX+6ctzZDduyK/ng4DpZ61z
NC3X1K0l2BMTyK2/1Rxo1p6FzEgVGFKDnbj6mO8mO1rB622X
-----END CERTIFICATE-----`;

const ROOT_PEM = `-----BEGIN CERTIFICATE-----
MIIDNTCCAh2gAwIBAgIUUYOV54z/xpz0vFjzrJ8iTaNRlt4wDQYJKoZIhvcNAQEL
BQAwKjEVMBMGA1UEAwwMVGVzdCBSb290IENBMREwDwYDVQQKDAhUZXN0IE9yZzAe
Fw0yNjA5MjMwMjE1MjdaFw0zNjA5MjAwMjE1MjdaMCoxFTATBgNVBAMMDFRlc3Qg
Um9vdCBDQTERMA8GA1UECgwIVGVzdCBPcmcwggEiMA0GCSqGSIb3DQEBAQUAA4IB
DwAwggEKAoIBAQDhNKiB1bDc5eYalllqa9KG+ZOkAYEQ6dv2ZkeiDkunlIU5f5lR
ZT8bCgUwg3HTI2qeMWTZ82k680bUTBDaxruaWO+iC3u/xBBVOpShtG8Bk7dtsiGW
FUztA7DK4nkOS4enoFrHH0vP5cwnc8p7GinM3ig80erQEz4M683Uu3BdCxXiNxBM
dxFXH8ytdEQ+qqXuNKhc269JDjwHh5x2kmkX2BtnkNhOy6ecIh+nSpmYGAHRPSwb
Uh4/w78PLXg9m9qzlCIhS1nDOFzaw6hLoARfi+U8NgUkcpD64ezux8FU5Lsu9vJt
jaCH5misXvrgDiUQL5ZxP+xJeOmKcND1FNRBAgMBAAGjUzBRMB0GA1UdDgQWBBSu
4Bf7k7uvYPSqeMrHacici4KUTjAfBgNVHSMEGDAWgBSu4Bf7k7uvYPSqeMrHacic
i4KUTjAPBgNVHRMBAf8EBTADAQH/MA0GCSqGSIb3DQEBCwUAA4IBAQAS4jOpg1JB
i3cdDsorI/bkJGYkjHFLYtcXkbSZOhrxNPf/Ix3QmBICl2efZcXfzJ27w/O4Tqvb
ygiko5kKsLOAMyEZX/z8/JI9R1F8WQdVVx/wmZAK3iXMsgYRQQcw4HhIH7jKEL83
CCC2FWnfkV70apcUFCPYJ+7twJd2ZUIQbNvEcoH+xWLerisug+C57Vt8oMJvB00E
4O3yu9cOrd+FJmPROx0q2bceahTNpjh141/ucR9g2rhoTcJltlLeLZlJ4hIZ3VFx
HEl6b+hQE2haBXL058P+DUqhYQxxvXZDpscFN3HZIlvgWjaf73ENxdIe+irGnebA
4VK7ioTslNyu
-----END CERTIFICATE-----`;

describe('certificate-chain-logic', () => {
  describe('splitPemBundle', () => {
    it('splits a multi-certificate bundle into individual entries', () => {
      const bundle = [LEAF_PEM, INTER_PEM, ROOT_PEM].join('\n');
      const result = splitPemBundle(bundle);
      expect(result.ok).toBe(true);
      if (!result.ok) throw new Error(result.error);
      expect(result.entries).toHaveLength(3);
      expect(result.entries[0].fields.subject).toEqual(
        expect.arrayContaining([expect.objectContaining({ shortName: 'CN', value: 'leaf.example.org' })]),
      );
    });

    it('rejects a bundle with no CERTIFICATE blocks', () => {
      const result = splitPemBundle('just some text, no PEM here');
      expect(result.ok).toBe(false);
    });
  });

  describe('linkChain', () => {
    it('reorders a shuffled bag of certificates into leaf -> intermediate -> root', () => {
      const split = splitPemBundle([ROOT_PEM, LEAF_PEM, INTER_PEM].join('\n'));
      if (!split.ok) throw new Error(split.error);

      const { ordered, warnings } = linkChain(split.entries);
      expect(warnings).toEqual([]);
      expect(ordered.map((e) => e.fields.subject.find((f) => f.shortName === 'CN')?.value)).toEqual([
        'leaf.example.org',
        'Test Intermediate CA',
        'Test Root CA',
      ]);
    });

    it('leaves a single certificate as-is', () => {
      const split = splitPemBundle(LEAF_PEM);
      if (!split.ok) throw new Error(split.error);
      const { ordered, warnings } = linkChain(split.entries);
      expect(ordered).toEqual(split.entries);
      expect(warnings).toEqual([]);
    });
  });

  describe('verifyChain', () => {
    it('verifies a correctly ordered leaf -> intermediate -> root chain', () => {
      const result = verifyChain([LEAF_PEM, INTER_PEM, ROOT_PEM]);
      expect(result.ok).toBe(true);
      expect(result.error).toBeNull();
    });

    it('rejects an incorrectly ordered chain', () => {
      const result = verifyChain([INTER_PEM, LEAF_PEM, ROOT_PEM]);
      expect(result.ok).toBe(false);
    });

    it('rejects a chain missing its intermediate', () => {
      const result = verifyChain([LEAF_PEM, ROOT_PEM]);
      expect(result.ok).toBe(false);
    });

    it('requires at least two certificates', () => {
      const result = verifyChain([LEAF_PEM]);
      expect(result.ok).toBe(false);
      expect(result.error).toMatch(/at least two/i);
    });
  });

  describe('assembleBundle', () => {
    it('joins ordered PEM blocks with newlines', () => {
      const bundle = assembleBundle([LEAF_PEM, INTER_PEM]);
      expect(bundle).toContain(LEAF_PEM);
      expect(bundle).toContain(INTER_PEM);
      expect(bundle.indexOf(LEAF_PEM)).toBeLessThan(bundle.indexOf(INTER_PEM));
    });
  });
});
