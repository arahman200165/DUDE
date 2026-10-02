/** Pure, framework-free payload builders for the QR Code Generator's presets. */

export type QrPreset = 'text' | 'wifi' | 'contact' | 'totp';

export interface WifiPayloadInput {
  readonly ssid: string;
  readonly password: string;
  readonly security: 'WPA' | 'WEP' | 'nopass';
  readonly hidden: boolean;
}

function escapeWifiField(value: string): string {
  return value.replace(/([\\;,:"])/g, '\\$1');
}

export function buildWifiPayload(input: WifiPayloadInput): string {
  const password = input.security === 'nopass' ? '' : `P:${escapeWifiField(input.password)};`;
  const hidden = input.hidden ? 'H:true;' : '';
  return `WIFI:T:${input.security};S:${escapeWifiField(input.ssid)};${password}${hidden};`;
}

export interface ContactPayloadInput {
  readonly name: string;
  readonly phone: string;
  readonly email: string;
  readonly organization: string;
}

export function buildContactPayload(input: ContactPayloadInput): string {
  const lines = ['BEGIN:VCARD', 'VERSION:3.0', `FN:${input.name}`];
  if (input.organization.trim()) lines.push(`ORG:${input.organization}`);
  if (input.phone.trim()) lines.push(`TEL:${input.phone}`);
  if (input.email.trim()) lines.push(`EMAIL:${input.email}`);
  lines.push('END:VCARD');
  return lines.join('\n');
}

export interface TotpPayloadInput {
  readonly secret: string;
  readonly issuer: string;
  readonly accountName: string;
  readonly algorithm: 'SHA1' | 'SHA256' | 'SHA512';
  readonly digits: 6 | 8;
  readonly period: number;
}

export function buildTotpPayload(input: TotpPayloadInput): string {
  const label = input.issuer.trim() ? `${input.issuer}:${input.accountName}` : input.accountName;
  const params = new URLSearchParams({
    secret: input.secret,
    issuer: input.issuer,
    algorithm: input.algorithm,
    digits: String(input.digits),
    period: String(input.period),
  });
  return `otpauth://totp/${encodeURIComponent(label)}?${params.toString()}`;
}
