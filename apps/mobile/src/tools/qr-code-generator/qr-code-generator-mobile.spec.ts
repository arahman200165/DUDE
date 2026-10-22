import { describe, expect, it } from 'vitest';
import { buildPayload, clampQuietZone, displayPayload, encodeQr, qrPathData, qrSvgString, sizeLabel, type QrFields } from './qr-code-generator-mobile';

const FIELDS: QrFields = {
  text: 'hello', wifiSsid: 'Home', wifiPassword: 'secret123', wifiSecurity: 'WPA', wifiHidden: false,
  contactName: 'Ada', contactPhone: '', contactEmail: '', contactOrg: '', totpSecret: 'JBSWY3DPEHPK3PXP', totpIssuer: 'DUDE', totpAccount: 'ada',
};

describe('qr-code-generator mobile helpers', () => {
  it('encodes "hello" at level M as a 21 x 21 version 1 symbol', () => {
    const result = encodeQr('hello', 'M');
    expect(result.ok && sizeLabel(result.matrix)).toBe('21 \u00d7 21 modules');
    expect(result.ok && result.matrix.version).toBe(1);
  });
  it('reports empty and oversize payloads', () => {
    expect(encodeQr('  ', 'M').ok).toBe(false);
    expect(encodeQr('x'.repeat(5000), 'H')).toEqual({ ok: false, error: expect.stringContaining('too big') });
  });
  it('merges runs into one path whose area equals the dark module count', () => {
    const result = encodeQr('hello', 'M');
    if (!result.ok) throw new Error('encode failed');
    const path = qrPathData(result.matrix, 0);
    const area = [...path.matchAll(/h(\d+)v1/g)].reduce((sum, match) => sum + Number(match[1]), 0);
    expect(area).toBe(result.matrix.dark.reduce((sum, value) => sum + value, 0));
    expect(qrSvgString(result.matrix, 2, 300)).toContain('viewBox="0 0 25 25"');
  });
  it('builds the Wi-Fi payload with the shared builder and masks the password until revealed', () => {
    expect(buildPayload('wifi', FIELDS)).toBe('WIFI:T:WPA;S:Home;P:secret123;;');
    expect(displayPayload('wifi', FIELDS, false)).toBe('WIFI:T:WPA;S:Home;P:\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022;;');
    expect(displayPayload('wifi', FIELDS, true)).toBe('WIFI:T:WPA;S:Home;P:secret123;;');
    expect(displayPayload('totp', FIELDS, false)).not.toContain('JBSWY3DPEHPK3PXP');
  });
  it('clamps the quiet zone', () => {
    expect([clampQuietZone(-3), clampQuietZone(2.4), clampQuietZone(99), clampQuietZone(Number.NaN)]).toEqual([0, 2, 10, 2]);
  });
});
