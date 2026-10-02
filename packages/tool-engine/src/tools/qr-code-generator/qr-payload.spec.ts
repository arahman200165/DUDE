import { describe, expect, it } from 'vitest';
import { buildContactPayload, buildTotpPayload, buildWifiPayload } from "./qr-payload.js";

describe('buildWifiPayload', () => {
  it('builds a WPA payload', () => {
    expect(buildWifiPayload({ ssid: 'HomeNet', password: 'hunter2', security: 'WPA', hidden: false })).toBe('WIFI:T:WPA;S:HomeNet;P:hunter2;;');
  });

  it('omits the password field for open networks', () => {
    expect(buildWifiPayload({ ssid: 'Open', password: '', security: 'nopass', hidden: false })).toBe('WIFI:T:nopass;S:Open;;');
  });

  it('marks hidden networks', () => {
    expect(buildWifiPayload({ ssid: 'Hidden', password: 'pw', security: 'WPA', hidden: true })).toBe('WIFI:T:WPA;S:Hidden;P:pw;H:true;;');
  });

  it('escapes special characters in SSID/password', () => {
    expect(buildWifiPayload({ ssid: 'a;b', password: 'c:d', security: 'WPA', hidden: false })).toBe('WIFI:T:WPA;S:a\\;b;P:c\\:d;;');
  });
});

describe('buildContactPayload', () => {
  it('builds a minimal vCard', () => {
    const result = buildContactPayload({ name: 'Ada Lovelace', phone: '', email: '', organization: '' });
    expect(result).toBe('BEGIN:VCARD\nVERSION:3.0\nFN:Ada Lovelace\nEND:VCARD');
  });

  it('includes optional fields when present', () => {
    const result = buildContactPayload({ name: 'Ada', phone: '555-1234', email: 'ada@example.com', organization: 'Analytical Engines Inc' });
    expect(result).toContain('ORG:Analytical Engines Inc');
    expect(result).toContain('TEL:555-1234');
    expect(result).toContain('EMAIL:ada@example.com');
  });
});

describe('buildTotpPayload', () => {
  it('builds an otpauth URI with issuer-prefixed label', () => {
    const result = buildTotpPayload({ secret: 'JBSWY3DPEHPK3PXP', issuer: 'Acme', accountName: 'alice@acme.com', algorithm: 'SHA1', digits: 6, period: 30 });
    expect(result).toMatch(/^otpauth:\/\/totp\/Acme%3Aalice%40acme\.com\?/);
    expect(result).toContain('secret=JBSWY3DPEHPK3PXP');
    expect(result).toContain('digits=6');
  });
});
