import { describe, expect, it } from 'vitest';
import { pipelineStep } from "./x509-certificate-inspector.pipeline-step.js";

/** Same real openssl-generated self-signed certificate used by `x509-logic.spec.ts`. */
const TEST_CERT_PEM = `-----BEGIN CERTIFICATE-----
MIIDojCCAoqgAwIBAgIUaJp0+MfQZDRY7wo1XhN//DTbW14wDQYJKoZIhvcNAQEL
BQAwNjEUMBIGA1UEAwwLZXhhbXBsZS5vcmcxETAPBgNVBAoMCFRlc3QgT3JnMQsw
CQYDVQQGEwJVUzAeFw0yNjA5MjMwMjEwMzhaFw0zNjA5MjAwMjEwMzhaMDYxFDAS
BgNVBAMMC2V4YW1wbGUub3JnMREwDwYDVQQKDAhUZXN0IE9yZzELMAkGA1UEBhMC
VVMwggEiMA0GCSqGSIb3DQEBAQUAA4IBDwAwggEKAoIBAQDC7vza4oNiaGsYWcQb
475zTBoRrU533+wXwBaqg35vvkO6WkDqwjljJKRJ0vO2PP+cvPS+s9lskQaL+IAp
JAmwDwEXnNkU1jd1WGqKBQ/3r5qjVSZFdGbUDe9DHvY1dv2sbjEXaDs776Hu/zzs
M6SDyu0nvYN2MhB+0FyMMqL0m1YutE7BcueCGYoMljRQ+PYX8yQ3g4JOLGRmlZBt
c5asflnHNMAnXZ/LE8fmeNzPHu/Oa4fg16pDL7WrwZoTVRxWYYoRa8Rdiq0BQ/WG
oHpGKoe7HoQA4RXLgSBp/kO4qNPDCTaRsbrhRnSrVwzmQIGGkznVp9pxOGJLTnxC
uyQFAgMBAAGjgacwgaQwQAYDVR0RBDkwN4ILZXhhbXBsZS5vcmeCD3d3dy5leGFt
cGxlLm9yZ4cEfwAAAYERYWRtaW5AZXhhbXBsZS5vcmcwEgYDVR0TAQH/BAgwBgEB
/wIBATAOBgNVHQ8BAf8EBAMCAYYwHQYDVR0lBBYwFAYIKwYBBQUHAwEGCCsGAQUF
BwMCMB0GA1UdDgQWBBTNkO4JusPa3D2x560fvdp/cPFFijANBgkqhkiG9w0BAQsF
AAOCAQEAO3fMYnbSiGqZMYdrHdV6iiXsRvDqyk4gCpZXkjVPhTKynpodylWcab5b
g58IeHvdRBeEWNCd/jrdYCOyUZhIvXCmiqEmYdEqNiPiUojPs6DoHhDGY1j26WsY
DfFTa6XBoOVPNxsR48gPdSSvE6KCc+GPo9Ya48tOl/fcV2PednbtbDjYTq45j353
OCRTI5I+axl6km2jKyhpnQByim4eLk+zMQtKmzZEBar/gEMWXwdD7+6glrgamCXy
Ge7vZv9Jv5dnMOYhvCYdVmsXqGuGlKIOevQpyFr55Clm7ZrerRFF1dazhm1AgL36
1NXBIt8DpBKTEn0LfI8i1zTkuFtDAQ==
-----END CERTIFICATE-----`;

describe('x509-certificate-inspector pipeline step', () => {
  it('parses a real PEM certificate into JSON fields with ISO date strings', async () => {
    const result = await pipelineStep.run({ type: 'text', value: TEST_CERT_PEM });
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error('expected ok');
    expect(result.output.type).toBe('json');
    const value = result.output.value as { fields: { notBefore: string; notAfter: string }; fingerprintSha256: string };
    expect(typeof value.fields.notBefore).toBe('string');
    expect(new Date(value.fields.notBefore).toString()).not.toBe('Invalid Date');
    expect(value.fingerprintSha256).toBe(
      'a7:0d:41:fd:e1:e5:3f:3d:5d:fb:41:db:70:d6:22:1a:14:d2:08:1d:72:71:6e:25:1a:ab:4a:7d:b7:3a:81:3f',
    );
  });

  it('fails on malformed certificate text', async () => {
    const result = await pipelineStep.run({ type: 'text', value: 'definitely not a certificate' });
    expect(result.ok).toBe(false);
  });

  it('rejects unsupported input types', async () => {
    const result = await pipelineStep.run({ type: 'json', value: {} });
    expect(result).toEqual({
      ok: false,
      error: { message: 'X.509 Certificate Inspector expects text or file input.', kind: 'invalid-input' },
    });
  });
});
