import { scanPayloadKindLabel, type ScanPayload } from '@dude/tool-engine/tools/qr-code-scanner/scan-payload';
import type { KeyValueRow } from '../../kit';

/** What a masked secret shows; matches the engine's `redactedRaw` mask. */
export const SECRET_MASK = '***';

export interface ScanRows {
  /** Plain rows, safe to show and copy. The first row is always `kind`. */
  readonly rows: readonly KeyValueRow[];
  /** Secret rows carrying the real value (Wi-Fi password, OTP secret). The UI masks them until the user reveals. */
  readonly secrets: readonly KeyValueRow[];
}

const yesNo = (value: boolean): string => (value ? 'Yes' : 'No');
const orNone = (value: string): string => (value === '' ? '(none)' : value);

/** Labelled fields of one classified scan payload. Pure: the display and copy rules live in the screen. */
export function scanRows(payload: ScanPayload): ScanRows {
  const rows: KeyValueRow[] = [{ key: 'kind', label: 'Type', value: scanPayloadKindLabel(payload.kind) }];
  const secrets: KeyValueRow[] = [];
  switch (payload.kind) {
    case 'url':
      rows.push({ key: 'url', label: 'URL', value: payload.href }, { key: 'scheme', label: 'Scheme', value: payload.scheme }, { key: 'host', label: 'Host', value: payload.host });
      if (payload.hasUserInfo) rows.push({ key: 'userinfo', label: 'Embedded credentials', value: 'Yes (user:pass@ before the host, a common phishing marker)' });
      break;
    case 'wifi':
      rows.push(
        { key: 'ssid', label: 'Network name (SSID)', value: payload.ssid },
        { key: 'security', label: 'Security', value: payload.security === 'nopass' ? 'Open (no password)' : payload.security },
        { key: 'hidden', label: 'Hidden network', value: yesNo(payload.hidden) },
      );
      if (payload.password === null) rows.push({ key: 'password', label: 'Password', value: '(none)' });
      else secrets.push({ key: 'password', label: 'Password', value: payload.password });
      break;
    case 'contact':
      rows.push({ key: 'format', label: 'Format', value: payload.format === 'vcard' ? 'vCard' : 'MECARD' }, { key: 'name', label: 'Name', value: orNone(payload.name) }, { key: 'organization', label: 'Organization', value: orNone(payload.organization) });
      payload.phones.forEach((value, index) => rows.push({ key: `phone-${index}`, label: 'Phone', value }));
      payload.emails.forEach((value, index) => rows.push({ key: `email-${index}`, label: 'Email', value }));
      payload.urls.forEach((value, index) => rows.push({ key: `url-${index}`, label: 'Website', value }));
      break;
    case 'otp':
      rows.push(
        { key: 'otp-type', label: 'OTP type', value: payload.otpType === 'totp' ? 'Time-based (TOTP)' : 'Counter-based (HOTP)' },
        { key: 'issuer', label: 'Issuer', value: orNone(payload.issuer) },
        { key: 'account', label: 'Account', value: orNone(payload.accountName) },
        { key: 'algorithm', label: 'Algorithm', value: payload.algorithm },
        { key: 'digits', label: 'Digits', value: String(payload.digits) },
      );
      if (payload.period !== null) rows.push({ key: 'period', label: 'Period', value: `${payload.period} s` });
      if (payload.counter !== null) rows.push({ key: 'counter', label: 'Counter', value: String(payload.counter) });
      secrets.push({ key: 'secret', label: 'Secret', value: payload.secret });
      break;
    case 'email':
      rows.push({ key: 'to', label: 'To', value: payload.addresses.join(', ') }, { key: 'subject', label: 'Subject', value: orNone(payload.subject) }, { key: 'body', label: 'Body', value: orNone(payload.body) });
      break;
    case 'phone':
      rows.push({ key: 'number', label: 'Number', value: payload.number });
      break;
    case 'sms':
      rows.push({ key: 'number', label: 'Number', value: payload.number }, { key: 'body', label: 'Message', value: orNone(payload.body) });
      break;
    case 'geo':
      rows.push({ key: 'latitude', label: 'Latitude', value: String(payload.latitude) }, { key: 'longitude', label: 'Longitude', value: String(payload.longitude) });
      if (payload.altitude !== null) rows.push({ key: 'altitude', label: 'Altitude', value: String(payload.altitude) });
      break;
    case 'text':
      rows.push({ key: 'length', label: 'Characters', value: String([...payload.raw].length) });
      break;
  }
  return { rows, secrets };
}
