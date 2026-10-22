import { describe, expect, it } from 'vitest';
import { classifyScanPayload } from '@dude/tool-engine/tools/qr-code-scanner/scan-payload';
import { scanRows } from './scan-rows';

const byKey = (rows: readonly { key: string; value: string }[]) => Object.fromEntries(rows.map(row => [row.key, row.value]));

describe('scanRows', () => {
  it('keeps the Wi-Fi password out of the plain rows', () => {
    const { rows, secrets } = scanRows(classifyScanPayload('WIFI:T:WPA;S:HomeNet;P:hunter2;;'));
    expect(byKey(rows)).toMatchObject({ kind: 'Wi-Fi network', ssid: 'HomeNet', security: 'WPA', hidden: 'No' });
    expect(rows.some(row => row.value.includes('hunter2'))).toBe(false);
    expect(secrets).toEqual([{ key: 'password', label: 'Password', value: 'hunter2' }]);
  });

  it('shows an open network without a secret', () => {
    const { rows, secrets } = scanRows(classifyScanPayload('WIFI:T:nopass;S:Cafe;;'));
    expect(byKey(rows)).toMatchObject({ security: 'Open (no password)', password: '(none)' });
    expect(secrets).toEqual([]);
  });

  it('lists OTP parameters and isolates the secret', () => {
    const { rows, secrets } = scanRows(classifyScanPayload('otpauth://totp/Example:alice%40example.com?secret=JBSWY3DPEHPK3PXP&issuer=Example&algorithm=SHA256&digits=8&period=60'));
    expect(byKey(rows)).toMatchObject({ kind: 'One-time password', issuer: 'Example', account: 'alice@example.com', algorithm: 'SHA256', digits: '8', period: '60 s' });
    expect(secrets.map(row => row.value)).toEqual(['JBSWY3DPEHPK3PXP']);
  });

  it('flags embedded credentials in a link', () => {
    const { rows } = scanRows(classifyScanPayload('https://paypal.com@evil.test/login'));
    expect(byKey(rows)).toMatchObject({ kind: 'Web link', host: 'evil.test' });
    expect(byKey(rows).userinfo).toMatch(/^Yes/);
  });

  it('handles plain text, geo and sms', () => {
    expect(byKey(scanRows(classifyScanPayload('hello')).rows)).toEqual({ kind: 'Text', length: '5' });
    expect(byKey(scanRows(classifyScanPayload('geo:48.2,16.37')).rows)).toMatchObject({ latitude: '48.2', longitude: '16.37' });
    expect(byKey(scanRows(classifyScanPayload('SMSTO:+4912345:hi')).rows)).toMatchObject({ number: '+4912345', body: 'hi' });
  });
});
