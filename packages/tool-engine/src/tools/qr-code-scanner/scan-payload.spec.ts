import { describe, expect, it } from 'vitest';
import { buildContactPayload, buildTotpPayload, buildWifiPayload } from '../qr-code-generator/qr-payload.js';
import { classifyScanPayload, scanPayloadKindLabel } from './scan-payload.js';

describe('classifyScanPayload: plain text and robustness', () => {
  it('returns text for ordinary strings and the empty string', () => {
    for (const input of ['hello world', '', '   ', '12345', 'http://', 'https://   ', 'ftp://example.com']) {
      const result = classifyScanPayload(input);
      expect(result.kind).toBe('text');
      expect(result.raw).toBe(input);
      expect(result.sensitive).toBe(false);
    }
  });

  it('never throws on malformed escapes or truncated schemes', () => {
    for (const input of ['otpauth://totp/%E0%A4%A?secret=A', 'mailto:%E0%A4%A', 'tel:%', 'sms:%?body=%', 'WIFI:', 'WIFI:S:;;', 'BEGIN:VCARD', 'MECARD:', 'geo:', 'WIFI:S:a\\']) {
      expect(() => classifyScanPayload(input)).not.toThrow();
    }
  });

  it('labels every kind', () => {
    expect(scanPayloadKindLabel('wifi')).toBe('Wi-Fi network');
    expect(scanPayloadKindLabel('text')).toBe('Text');
  });
});

describe('classifyScanPayload: URL', () => {
  it('classifies http and https links', () => {
    const result = classifyScanPayload('https://Example.com:8443/path?q=1#frag');
    expect(result).toMatchObject({ kind: 'url', scheme: 'https', host: 'example.com', hasUserInfo: false, sensitive: false });
  });

  it('trims surrounding whitespace but keeps raw verbatim', () => {
    const result = classifyScanPayload('  http://a.test/x\n');
    expect(result).toMatchObject({ kind: 'url', href: 'http://a.test/x', raw: '  http://a.test/x\n' });
  });

  it('flags user info in the authority', () => {
    expect(classifyScanPayload('https://paypal.com@evil.test/login')).toMatchObject({ kind: 'url', host: 'evil.test', hasUserInfo: true });
  });

  it('parses IPv6 hosts and rejects whitespace and missing hosts', () => {
    expect(classifyScanPayload('http://[::1]:3000/')).toMatchObject({ kind: 'url', host: '[::1]' });
    expect(classifyScanPayload('https://exa mple.com').kind).toBe('text');
    expect(classifyScanPayload('https:///path').kind).toBe('text');
  });
});

describe('classifyScanPayload: Wi-Fi', () => {
  it('parses a WPA network and marks the password sensitive', () => {
    const result = classifyScanPayload('WIFI:T:WPA;S:HomeNet;P:hunter2;;');
    expect(result).toMatchObject({ kind: 'wifi', ssid: 'HomeNet', password: 'hunter2', security: 'WPA', hidden: false, sensitive: true });
    expect(result.redactedRaw).toBe('WIFI:T:WPA;S:HomeNet;P:***;;');
    expect(result.redactedRaw).not.toContain('hunter2');
  });

  it('parses open networks as not sensitive', () => {
    const result = classifyScanPayload('WIFI:T:nopass;S:Cafe;;');
    expect(result).toMatchObject({ kind: 'wifi', ssid: 'Cafe', password: null, security: 'nopass', sensitive: false });
    expect(result.redactedRaw).toBe(result.raw);
  });

  it('is order-independent, case-insensitive and reads the hidden flag', () => {
    expect(classifyScanPayload('wifi:S:Net;H:TRUE;P:pw;T:wep;;')).toMatchObject({ ssid: 'Net', hidden: true, security: 'WEP', password: 'pw' });
  });

  it('defaults the type from the password when T is missing', () => {
    expect(classifyScanPayload('WIFI:S:a;P:b;;')).toMatchObject({ security: 'WPA', password: 'b' });
    expect(classifyScanPayload('WIFI:S:a;;')).toMatchObject({ security: 'nopass', password: null });
  });

  it('unescapes \\; \\, \\: and \\\\ in the SSID and password', () => {
    const result = classifyScanPayload('WIFI:T:WPA;S:a\\;b\\,c\\:d\\\\e;P:p\\;w\\:\\\\;;');
    expect(result).toMatchObject({ kind: 'wifi', ssid: 'a;b,c:d\\e', password: 'p;w:\\' });
  });

  it('does not split on escaped semicolons when redacting', () => {
    expect(classifyScanPayload('WIFI:T:WPA;S:a\\;P:x;P:y\\;z;;').redactedRaw).toBe('WIFI:T:WPA;S:a\\;P:x;P:***;;');
  });

  it('strips the quotes that force a hex-looking SSID to be text', () => {
    expect(classifyScanPayload('WIFI:T:WPA;S:"deadbeef";P:"cafe";;')).toMatchObject({ ssid: 'deadbeef', password: 'cafe' });
  });

  it('round-trips the generator output, including escaped quotes', () => {
    const payload = buildWifiPayload({ ssid: 'My "Net"; 1', password: 'p:a\\ss,;', security: 'WPA', hidden: true });
    expect(classifyScanPayload(payload)).toMatchObject({ kind: 'wifi', ssid: 'My "Net"; 1', password: 'p:a\\ss,;', hidden: true, sensitive: true });
  });

  it('falls back to text when the SSID is missing or empty', () => {
    expect(classifyScanPayload('WIFI:T:WPA;P:pw;;').kind).toBe('text');
    expect(classifyScanPayload('WIFI:T:WPA;S:;P:pw;;').kind).toBe('text');
  });
});

describe('classifyScanPayload: otpauth', () => {
  it('parses a TOTP link and marks the secret sensitive', () => {
    const result = classifyScanPayload('otpauth://totp/Example:alice%40example.com?secret=JBSWY3DPEHPK3PXP&issuer=Example&algorithm=SHA256&digits=8&period=60');
    expect(result).toMatchObject({
      kind: 'otp',
      otpType: 'totp',
      label: 'Example:alice@example.com',
      issuer: 'Example',
      accountName: 'alice@example.com',
      secret: 'JBSWY3DPEHPK3PXP',
      algorithm: 'SHA256',
      digits: 8,
      period: 60,
      counter: null,
      sensitive: true,
    });
    expect(result.redactedRaw).toContain('secret=***');
    expect(result.redactedRaw).not.toContain('JBSWY3DPEHPK3PXP');
  });

  it('applies defaults and takes the issuer from the label', () => {
    expect(classifyScanPayload('otpauth://totp/ACME:bob?secret=ABC')).toMatchObject({ issuer: 'ACME', accountName: 'bob', algorithm: 'SHA1', digits: 6, period: 30 });
  });

  it('parses HOTP with a counter and rejects HOTP without one', () => {
    expect(classifyScanPayload('otpauth://hotp/bob?secret=ABC&counter=7')).toMatchObject({ otpType: 'hotp', counter: 7, period: null, sensitive: true });
    expect(classifyScanPayload('otpauth://hotp/bob?secret=ABC').kind).toBe('text');
  });

  it('keeps the secret redacted when it is not the first parameter, and ignores bad algorithm/digits', () => {
    const result = classifyScanPayload('otpauth://totp/x?issuer=I&secret=SEKRET&algorithm=MD5&digits=7');
    expect(result).toMatchObject({ algorithm: 'SHA1', digits: 6 });
    expect(result.redactedRaw).toBe('otpauth://totp/x?issuer=I&secret=***&algorithm=MD5&digits=7');
  });

  it('round-trips the generator output', () => {
    const payload = buildTotpPayload({ secret: 'JBSWY3DPEHPK3PXP', issuer: 'My Co', accountName: 'a b@c.d', algorithm: 'SHA512', digits: 8, period: 45 });
    expect(classifyScanPayload(payload)).toMatchObject({ kind: 'otp', issuer: 'My Co', accountName: 'a b@c.d', secret: 'JBSWY3DPEHPK3PXP', algorithm: 'SHA512', digits: 8, period: 45 });
  });

  it('falls back to text for a missing secret, unknown type or bad escapes', () => {
    expect(classifyScanPayload('otpauth://totp/x?issuer=I').kind).toBe('text');
    expect(classifyScanPayload('otpauth://totp/x?secret=').kind).toBe('text');
    expect(classifyScanPayload('otpauth://steam/x?secret=A').kind).toBe('text');
    expect(classifyScanPayload('otpauth://totp/%ZZ?secret=A').kind).toBe('text');
  });
});

describe('classifyScanPayload: contacts', () => {
  it('parses a vCard produced by the generator', () => {
    const payload = buildContactPayload({ name: 'Ada Lovelace', phone: '555-1234', email: 'ada@example.com', organization: 'Analytical Engines' });
    expect(classifyScanPayload(payload)).toMatchObject({
      kind: 'contact',
      format: 'vcard',
      name: 'Ada Lovelace',
      organization: 'Analytical Engines',
      phones: ['555-1234'],
      emails: ['ada@example.com'],
      sensitive: false,
    });
  });

  it('handles CRLF, folded lines, typed properties and structured names', () => {
    const vcard = ['BEGIN:VCARD', 'VERSION:3.0', 'N:Lovelace;Ada;Augusta;;', 'ORG:Engines\\, Inc;R&D', 'TEL;TYPE=CELL:+1 555 0100', 'TEL;TYPE=WORK:+1', ' 555 0200', 'item1.EMAIL;TYPE=INTERNET:ada@example.com', 'URL:https://example.com', 'END:VCARD'].join('\r\n');
    expect(classifyScanPayload(vcard)).toMatchObject({
      name: 'Ada Augusta Lovelace',
      organization: 'Engines, Inc, R&D',
      phones: ['+1 555 0100', '+1555 0200'],
      emails: ['ada@example.com'],
      urls: ['https://example.com'],
    });
  });

  it('prefers FN over N and unescapes vCard values', () => {
    expect(classifyScanPayload('BEGIN:VCARD\nFN:A\\;B\\, C\nN:X;Y\nEND:VCARD')).toMatchObject({ name: 'A;B, C' });
  });

  it('rejects a vCard with nothing identifying', () => {
    expect(classifyScanPayload('BEGIN:VCARD\nVERSION:3.0\nEND:VCARD').kind).toBe('text');
  });

  it('parses MECARD with Last,First names and escapes', () => {
    const result = classifyScanPayload('MECARD:N:Lovelace,Ada;TEL:555\\;1234;EMAIL:ada@example.com;ORG:A\\:B;URL:https\\://x.test;;');
    expect(result).toMatchObject({
      kind: 'contact',
      format: 'mecard',
      name: 'Ada Lovelace',
      phones: ['555;1234'],
      emails: ['ada@example.com'],
      organization: 'A:B',
      urls: ['https://x.test'],
    });
  });

  it('keeps an escaped comma inside a MECARD name and rejects empty MECARDs', () => {
    expect(classifyScanPayload('MECARD:N:Smith\\, Jr.;;')).toMatchObject({ name: 'Smith, Jr.' });
    expect(classifyScanPayload('MECARD:ORG:Only;;').kind).toBe('text');
  });
});

describe('classifyScanPayload: mailto, tel, sms, geo', () => {
  it('parses mailto with subject, body and multiple recipients', () => {
    expect(classifyScanPayload('mailto:a@x.test,b@x.test?subject=Hello%20there&body=Line%201%0ALine+2&to=c@x.test')).toMatchObject({
      kind: 'email',
      addresses: ['a@x.test', 'b@x.test', 'c@x.test'],
      subject: 'Hello there',
      body: 'Line 1\nLine 2',
    });
  });

  it('rejects mailto without a valid address', () => {
    expect(classifyScanPayload('mailto:').kind).toBe('text');
    expect(classifyScanPayload('mailto:not-an-address').kind).toBe('text');
  });

  it('parses tel numbers and drops extension parameters', () => {
    expect(classifyScanPayload('tel:+1-555-0100')).toMatchObject({ kind: 'phone', number: '+1-555-0100' });
    expect(classifyScanPayload('TEL:+1%20555;ext=9')).toMatchObject({ number: '+1 555' });
    expect(classifyScanPayload('tel:call-me').kind).toBe('text');
  });

  it('parses sms: query form and SMSTO: colon form', () => {
    expect(classifyScanPayload('sms:+15550100?body=Hi%20you')).toMatchObject({ kind: 'sms', number: '+15550100', body: 'Hi you' });
    expect(classifyScanPayload('SMSTO:+15550100:Meet at 5: ok?')).toMatchObject({ kind: 'sms', number: '+15550100', body: 'Meet at 5: ok?' });
    expect(classifyScanPayload('sms:+15550100')).toMatchObject({ kind: 'sms', body: '' });
    expect(classifyScanPayload('sms:abc').kind).toBe('text');
  });

  it('parses geo URIs and validates ranges', () => {
    expect(classifyScanPayload('geo:48.8584,2.2945')).toMatchObject({ kind: 'geo', latitude: 48.8584, longitude: 2.2945, altitude: null });
    expect(classifyScanPayload('geo:-33.8,151.2,12;u=35')).toMatchObject({ latitude: -33.8, longitude: 151.2, altitude: 12 });
    expect(classifyScanPayload('geo:91,0').kind).toBe('text');
    expect(classifyScanPayload('geo:0,181').kind).toBe('text');
    expect(classifyScanPayload('geo:north,east').kind).toBe('text');
  });
});
