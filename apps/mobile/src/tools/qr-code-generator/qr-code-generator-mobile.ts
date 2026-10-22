import { create } from 'qrcode/lib/core/qrcode';
import {
  buildContactPayload, buildTotpPayload, buildWifiPayload, type QrPreset,
} from '@dude/tool-engine/tools/qr-code-generator/qr-payload';

/**
 * Pure mobile-side helpers for the QR Code Generator. Payloads come from the shared builders; the module matrix comes from
 * the `qrcode` core encoder (`lib/core/qrcode`, no canvas or Node renderer), the same encoder the web tool's `toDataURL` uses.
 */

export type EcLevel = 'L' | 'M' | 'Q' | 'H';
export type WifiSecurity = 'WPA' | 'WEP' | 'nopass';

/** Web values for the persisted `preset`, `ecLevel` and `wifiSecurity` keys. */
export const PRESETS: readonly { readonly id: QrPreset; readonly label: string }[] = [
  { id: 'text', label: 'Text / URL' }, { id: 'wifi', label: 'Wi-Fi' }, { id: 'contact', label: 'Contact' }, { id: 'totp', label: 'TOTP' },
];
export const EC_LEVELS: readonly { readonly value: EcLevel; readonly label: string }[] = [
  { value: 'L', label: 'L (7%)' }, { value: 'M', label: 'M (15%)' }, { value: 'Q', label: 'Q (25%)' }, { value: 'H', label: 'H (30%)' },
];
export const WIFI_SECURITIES: readonly { readonly id: WifiSecurity; readonly label: string }[] = [
  { id: 'WPA', label: 'WPA/WPA2' }, { id: 'WEP', label: 'WEP' }, { id: 'nopass', label: 'None' },
];

export const decodePreset = (raw: unknown): QrPreset | null => raw === 'text' || raw === 'wifi' || raw === 'contact' || raw === 'totp' ? raw : null;
export const decodeEcLevel = (raw: unknown): EcLevel | null => raw === 'L' || raw === 'M' || raw === 'Q' || raw === 'H' ? raw : null;
export const decodeWifiSecurity = (raw: unknown): WifiSecurity | null => raw === 'WPA' || raw === 'WEP' || raw === 'nopass' ? raw : null;

export interface QrFields {
  readonly text: string;
  readonly wifiSsid: string; readonly wifiPassword: string; readonly wifiSecurity: WifiSecurity; readonly wifiHidden: boolean;
  readonly contactName: string; readonly contactPhone: string; readonly contactEmail: string; readonly contactOrg: string;
  readonly totpSecret: string; readonly totpIssuer: string; readonly totpAccount: string;
}

/** Same selection the web component makes (TOTP is SHA1, 6 digits, 30 s there). */
export function buildPayload(preset: QrPreset, fields: QrFields): string {
  switch (preset) {
    case 'wifi': return buildWifiPayload({ ssid: fields.wifiSsid, password: fields.wifiPassword, security: fields.wifiSecurity, hidden: fields.wifiHidden });
    case 'contact': return buildContactPayload({ name: fields.contactName, phone: fields.contactPhone, email: fields.contactEmail, organization: fields.contactOrg });
    case 'totp': return buildTotpPayload({ secret: fields.totpSecret, issuer: fields.totpIssuer, accountName: fields.totpAccount, algorithm: 'SHA1', digits: 6, period: 30 });
    default: return fields.text;
  }
}

/** The payload as shown on screen: the Wi-Fi password and TOTP secret become bullets until the user reveals them. */
export function displayPayload(preset: QrPreset, fields: QrFields, reveal: boolean): string {
  if (reveal) return buildPayload(preset, fields);
  const mask = (value: string): string => '•'.repeat(value.length);
  return buildPayload(preset, { ...fields, wifiPassword: mask(fields.wifiPassword), totpSecret: mask(fields.totpSecret) });
}

export interface QrMatrix { readonly size: number; readonly version: number; readonly dark: Uint8Array }
export type QrResult = { readonly ok: true; readonly matrix: QrMatrix } | { readonly ok: false; readonly error: string };

export function encodeQr(payload: string, errorCorrectionLevel: EcLevel): QrResult {
  if (payload.trim() === '') return { ok: false, error: 'Enter something to encode.' };
  try {
    const symbol = create(payload, { errorCorrectionLevel });
    const size = symbol.modules.size;
    const dark = new Uint8Array(size * size);
    for (let row = 0; row < size; row++) for (let col = 0; col < size; col++) dark[row * size + col] = symbol.modules.get(row, col) ? 1 : 0;
    return { ok: true, matrix: { size, version: symbol.version, dark } };
  } catch (error) {
    const message = error instanceof Error ? (error.message.split('\n')[0] ?? '') : '';
    return { ok: false, error: message === '' ? 'Could not generate this QR code.' : message };
  }
}

export const sizeLabel = (matrix: QrMatrix): string => `${matrix.size} × ${matrix.size} modules`;

export const MIN_QUIET_ZONE = 0;
export const MAX_QUIET_ZONE = 10;
export const DEFAULT_QUIET_ZONE = 2;
export const EXPORT_SIZES = [256, 512, 1024] as const;
export const DEFAULT_EXPORT_SIZE = 512;

export const clampQuietZone = (value: number): number => Number.isFinite(value) ? Math.min(MAX_QUIET_ZONE, Math.max(MIN_QUIET_ZONE, Math.round(value))) : DEFAULT_QUIET_ZONE;

/** One path of merged horizontal runs in module units, offset by the quiet zone: `M x y h w v1 h-w z` per run. */
export function qrPathData(matrix: QrMatrix, quietZone: number): string {
  const { size, dark } = matrix;
  const parts: string[] = [];
  for (let row = 0; row < size; row++) {
    let col = 0;
    while (col < size) {
      if (!dark[row * size + col]) { col++; continue; }
      const start = col;
      while (col < size && dark[row * size + col]) col++;
      const width = col - start;
      parts.push(`M${start + quietZone} ${row + quietZone}h${width}v1h-${width}z`);
    }
  }
  return parts.join('');
}

export const totalModules = (matrix: QrMatrix, quietZone: number): number => matrix.size + quietZone * 2;

/** Black modules on white (never theme colors): the code has to stay scannable in every theme. */
export function qrSvgString(matrix: QrMatrix, quietZone: number, pixels: number): string {
  const total = totalModules(matrix, quietZone);
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${pixels}" height="${pixels}" viewBox="0 0 ${total} ${total}" shape-rendering="crispEdges">`
    + `<rect width="${total}" height="${total}" fill="#ffffff"/><path d="${qrPathData(matrix, quietZone)}" fill="#000000"/></svg>`;
}
