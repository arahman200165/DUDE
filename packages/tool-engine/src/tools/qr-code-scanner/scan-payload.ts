/**
 * Pure, DOM-free classification of decoded QR / barcode text (Phase 31I). The web scanners and a
 * React Native screen decode pixels with their own libraries, then hand the text here. No `URL` or
 * `URLSearchParams` is used so the module also runs on engines that ship partial implementations.
 *
 * Anything malformed (a `WIFI:` string with no SSID, an `otpauth://` link with no secret, ...) falls
 * back to `{ kind: 'text' }` rather than throwing. `sensitive` is true for Wi-Fi passwords and
 * one-time-password secrets; callers must never persist such a result, and should display
 * `redactedRaw` instead of `raw`.
 */

export interface ScanPayloadBase {
  /** The decoded text exactly as scanned. */
  readonly raw: string;
  /** True when the payload carries a secret (Wi-Fi password, OTP secret); never persist it. */
  readonly sensitive: boolean;
  /** `raw` with secrets masked, safe for history, logs and screenshots. */
  readonly redactedRaw: string;
}

export interface UrlScanPayload extends ScanPayloadBase {
  readonly kind: 'url';
  readonly href: string;
  readonly scheme: 'http' | 'https';
  readonly host: string;
  /** True when the authority carries `user:pass@`, a common phishing marker. */
  readonly hasUserInfo: boolean;
}

export interface WifiScanPayload extends ScanPayloadBase {
  readonly kind: 'wifi';
  readonly ssid: string;
  /** `null` for open networks. */
  readonly password: string | null;
  /** `nopass` for open networks, otherwise the upper-cased `T:` value (`WPA`, `WEP`, `SAE`, ...). */
  readonly security: string;
  readonly hidden: boolean;
}

export interface ContactScanPayload extends ScanPayloadBase {
  readonly kind: 'contact';
  readonly format: 'vcard' | 'mecard';
  readonly name: string;
  readonly organization: string;
  readonly phones: readonly string[];
  readonly emails: readonly string[];
  readonly urls: readonly string[];
}

export interface OtpScanPayload extends ScanPayloadBase {
  readonly kind: 'otp';
  readonly otpType: 'totp' | 'hotp';
  readonly label: string;
  readonly issuer: string;
  readonly accountName: string;
  readonly secret: string;
  readonly algorithm: 'SHA1' | 'SHA256' | 'SHA512';
  readonly digits: number;
  /** TOTP step in seconds; `null` for HOTP. */
  readonly period: number | null;
  /** HOTP counter; `null` for TOTP. */
  readonly counter: number | null;
}

export interface EmailScanPayload extends ScanPayloadBase {
  readonly kind: 'email';
  readonly addresses: readonly string[];
  readonly subject: string;
  readonly body: string;
}

export interface PhoneScanPayload extends ScanPayloadBase {
  readonly kind: 'phone';
  readonly number: string;
}

export interface SmsScanPayload extends ScanPayloadBase {
  readonly kind: 'sms';
  readonly number: string;
  readonly body: string;
}

export interface GeoScanPayload extends ScanPayloadBase {
  readonly kind: 'geo';
  readonly latitude: number;
  readonly longitude: number;
  readonly altitude: number | null;
}

export interface TextScanPayload extends ScanPayloadBase {
  readonly kind: 'text';
}

export type ScanPayload =
  | UrlScanPayload
  | WifiScanPayload
  | ContactScanPayload
  | OtpScanPayload
  | EmailScanPayload
  | PhoneScanPayload
  | SmsScanPayload
  | GeoScanPayload
  | TextScanPayload;

export type ScanPayloadKind = ScanPayload['kind'];

const REDACTED = '***';

/** Percent-decodes `value` (also `+` as a space when `plus` is set); `null` for a malformed escape. */
function percentDecode(value: string, plus = false): string | null {
  try {
    return decodeURIComponent(plus ? value.replace(/\+/g, ' ') : value);
  } catch {
    return null;
  }
}

/** Splits a query string into decoded key/value pairs; keys are lower-cased. `null` when malformed. */
function parseQuery(query: string): Map<string, string> | null {
  const params = new Map<string, string>();
  for (const pair of query.split('&')) {
    if (pair === '') continue;
    const eq = pair.indexOf('=');
    const key = percentDecode(eq === -1 ? pair : pair.slice(0, eq), true);
    const value = percentDecode(eq === -1 ? '' : pair.slice(eq + 1), true);
    if (key === null || value === null) return null;
    const lower = key.toLowerCase();
    if (!params.has(lower)) params.set(lower, value);
  }
  return params;
}

/** Splits `value` on every `separator` that is not preceded by a backslash escape; escapes are kept. */
function splitUnescaped(value: string, separator: string): string[] {
  const parts: string[] = [];
  let current = '';
  for (let i = 0; i < value.length; i += 1) {
    const ch = value[i];
    if (ch === '\\' && i + 1 < value.length) {
      current += ch + value[i + 1];
      i += 1;
    } else if (ch === separator) {
      parts.push(current);
      current = '';
    } else {
      current += ch;
    }
  }
  parts.push(current);
  return parts;
}

/** Removes the backslash from each `\X` pair (`\;` `\,` `\:` `\\` `\"` ...). */
function unescapeBackslash(value: string): string {
  return value.replace(/\\([\s\S])/g, '$1');
}

/** Unescapes a Wi-Fi/MECARD field value, dropping the quotes that force a hex-looking SSID to be text. */
function unescapeField(value: string): string {
  const quoted = value.length >= 2 && value.startsWith('"') && value.endsWith('"') && !value.endsWith('\\"');
  return unescapeBackslash(quoted ? value.slice(1, -1) : value);
}

/** Splits `K:value;K:value;;` (the part after the scheme) into raw (still escaped) key/value pairs. */
function splitSemicolonFields(body: string): Array<[string, string]> {
  const fields: Array<[string, string]> = [];
  for (const part of splitUnescaped(body, ';')) {
    if (part === '') continue;
    const colon = part.indexOf(':');
    if (colon <= 0) continue;
    fields.push([part.slice(0, colon).toUpperCase(), part.slice(colon + 1)]);
  }
  return fields;
}

function text(raw: string): TextScanPayload {
  return { kind: 'text', raw, sensitive: false, redactedRaw: raw };
}

// --- Wi-Fi ------------------------------------------------------------------------------------

function parseWifi(raw: string, trimmed: string): WifiScanPayload | null {
  if (!/^WIFI:/i.test(trimmed)) return null;
  const fields = splitSemicolonFields(trimmed.slice(5));
  const get = (key: string): string | undefined => fields.find(([k]) => k === key)?.[1];

  const ssidRaw = get('S');
  if (ssidRaw === undefined) return null;
  const ssid = unescapeField(ssidRaw);
  if (ssid === '') return null;

  const passwordRaw = get('P');
  const password = passwordRaw === undefined ? null : unescapeField(passwordRaw);
  const typeRaw = get('T')?.trim() ?? '';
  const security =
    typeRaw === '' ? (password ? 'WPA' : 'nopass') : /^nopass$/i.test(typeRaw) ? 'nopass' : typeRaw.toUpperCase();
  const effectivePassword = security === 'nopass' || password === '' ? null : password;
  const hidden = /^true$/i.test(get('H')?.trim() ?? '');

  const redactedRaw =
    effectivePassword === null
      ? raw
      : 'WIFI:' +
        splitUnescaped(trimmed.slice(5), ';')
          .map((part) => (/^P:/i.test(part) ? `P:${REDACTED}` : part))
          .join(';');

  return { kind: 'wifi', raw, sensitive: effectivePassword !== null, redactedRaw, ssid, password: effectivePassword, security, hidden };
}

// --- Contacts ---------------------------------------------------------------------------------

function parseMecard(raw: string, trimmed: string): ContactScanPayload | null {
  if (!/^MECARD:/i.test(trimmed)) return null;
  const fields = splitSemicolonFields(trimmed.slice(7));
  const all = (key: string): string[] => fields.filter(([k]) => k === key).map(([, v]) => unescapeField(v));

  // N is "Last,First"; an escaped comma (`\,`) belongs to the name itself.
  const nameRaw = fields.find(([k]) => k === 'N')?.[1] ?? '';
  const nameParts = splitUnescaped(nameRaw, ',').map(unescapeField).filter((part) => part !== '');
  const name = nameParts.length > 1 ? `${nameParts.slice(1).join(' ')} ${nameParts[0]}` : (nameParts[0] ?? '');

  const phones = all('TEL');
  const emails = all('EMAIL');
  if (name === '' && phones.length === 0 && emails.length === 0) return null;
  return {
    kind: 'contact',
    format: 'mecard',
    raw,
    sensitive: false,
    redactedRaw: raw,
    name,
    organization: all('ORG')[0] ?? '',
    phones,
    emails,
    urls: all('URL'),
  };
}

function unescapeVcardValue(value: string): string {
  return value.replace(/\\([nN,;\\])/g, (_m, ch: string) => (ch === 'n' || ch === 'N' ? '\n' : ch));
}

function parseVcard(raw: string, trimmed: string): ContactScanPayload | null {
  if (!/^BEGIN:VCARD/i.test(trimmed)) return null;
  // Unfold continuation lines (a line starting with a space or tab continues the previous one).
  const lines = trimmed.replace(/\r\n|\r/g, '\n').replace(/\n[ \t]/g, '').split('\n');
  const phones: string[] = [];
  const emails: string[] = [];
  const urls: string[] = [];
  let fn = '';
  let structuredName = '';
  let organization = '';

  for (const line of lines) {
    const colon = line.indexOf(':');
    if (colon <= 0) continue;
    const property = line.slice(0, colon).split(';')[0].toUpperCase().replace(/^[A-Z0-9-]+\./, '');
    const value = line.slice(colon + 1);
    switch (property) {
      case 'FN':
        fn = unescapeVcardValue(value).trim();
        break;
      case 'N': {
        // family;given;additional;prefix;suffix
        const [family = '', given = '', additional = ''] = splitUnescaped(value, ';').map((part) => unescapeVcardValue(part).trim());
        structuredName = [given, additional, family].filter((part) => part !== '').join(' ');
        break;
      }
      case 'ORG':
        organization = splitUnescaped(value, ';').map((part) => unescapeVcardValue(part).trim()).filter((part) => part !== '').join(', ');
        break;
      case 'TEL':
        if (value.trim() !== '') phones.push(unescapeVcardValue(value).trim());
        break;
      case 'EMAIL':
        if (value.trim() !== '') emails.push(unescapeVcardValue(value).trim());
        break;
      case 'URL':
        if (value.trim() !== '') urls.push(unescapeVcardValue(value).trim());
        break;
      default:
        break;
    }
  }

  const name = fn || structuredName;
  if (name === '' && phones.length === 0 && emails.length === 0) return null;
  return { kind: 'contact', format: 'vcard', raw, sensitive: false, redactedRaw: raw, name, organization, phones, emails, urls };
}

// --- otpauth ----------------------------------------------------------------------------------

function parseOtp(raw: string, trimmed: string): OtpScanPayload | null {
  const match = /^otpauth:\/\/(totp|hotp)\/([^?#]*)(?:\?([^#]*))?/i.exec(trimmed);
  if (!match) return null;
  const otpType = match[1].toLowerCase() as 'totp' | 'hotp';
  const label = percentDecode(match[2]);
  const params = parseQuery(match[3] ?? '');
  if (label === null || params === null) return null;

  const secret = (params.get('secret') ?? '').replace(/\s+/g, '');
  if (secret === '') return null;

  const labelColon = label.indexOf(':');
  const labelIssuer = labelColon === -1 ? '' : label.slice(0, labelColon).trim();
  const accountName = (labelColon === -1 ? label : label.slice(labelColon + 1)).trim();
  const issuer = params.get('issuer') ?? labelIssuer;

  const algorithmRaw = (params.get('algorithm') ?? 'SHA1').toUpperCase();
  const algorithm = algorithmRaw === 'SHA256' || algorithmRaw === 'SHA512' ? algorithmRaw : 'SHA1';
  const digits = params.get('digits') === '8' ? 8 : 6;

  let period: number | null = null;
  let counter: number | null = null;
  if (otpType === 'totp') {
    const parsed = Number(params.get('period') ?? '30');
    period = Number.isInteger(parsed) && parsed > 0 ? parsed : 30;
  } else {
    const counterRaw = params.get('counter');
    const parsed = Number(counterRaw);
    if (counterRaw === undefined || counterRaw === '' || !Number.isInteger(parsed) || parsed < 0) return null; // HOTP requires a counter
    counter = parsed;
  }

  const redactedRaw = trimmed.replace(/([?&]secret=)[^&#]*/i, `$1${REDACTED}`);
  return { kind: 'otp', raw, sensitive: true, redactedRaw, otpType, label, issuer, accountName, secret, algorithm, digits, period, counter };
}

// --- Links and contact schemes ----------------------------------------------------------------

function parseUrl(raw: string, trimmed: string): UrlScanPayload | null {
  const match = /^(https?):\/\/([^/?#\s]+)([/?#]\S*)?$/i.exec(trimmed);
  if (!match) return null;
  const authority = match[2];
  const at = authority.lastIndexOf('@');
  const hostPort = at === -1 ? authority : authority.slice(at + 1);
  const host = hostPort.startsWith('[') ? hostPort.slice(0, hostPort.indexOf(']') + 1) : hostPort.replace(/:\d*$/, '');
  if (host === '' || host === '[') return null;
  return {
    kind: 'url',
    raw,
    sensitive: false,
    redactedRaw: raw,
    href: trimmed,
    scheme: match[1].toLowerCase() as 'http' | 'https',
    host: host.toLowerCase(),
    hasUserInfo: at !== -1,
  };
}

function parseMailto(raw: string, trimmed: string): EmailScanPayload | null {
  const match = /^mailto:([^?]*)(?:\?(.*))?$/i.exec(trimmed);
  if (!match) return null;
  const to = percentDecode(match[1]);
  const params = parseQuery(match[2] ?? '');
  if (to === null || params === null) return null;
  const addresses = [...to.split(','), ...(params.get('to') ?? '').split(',')].map((a) => a.trim()).filter((a) => a !== '');
  if (addresses.length === 0 || addresses.some((a) => !/^[^\s@]+@[^\s@]+$/.test(a))) return null;
  return { kind: 'email', raw, sensitive: false, redactedRaw: raw, addresses, subject: params.get('subject') ?? '', body: params.get('body') ?? '' };
}

const PHONE_NUMBER = /^[+*#]?[0-9][0-9()\s.\-*#]*$/;

function parseTel(raw: string, trimmed: string): PhoneScanPayload | null {
  const match = /^tel:([^?#]*)/i.exec(trimmed);
  if (!match) return null;
  const decoded = percentDecode(match[1]);
  if (decoded === null) return null;
  const number = decoded.split(';')[0].trim(); // drop `;ext=` / `;phone-context=` parameters
  if (!PHONE_NUMBER.test(number)) return null;
  return { kind: 'phone', raw, sensitive: false, redactedRaw: raw, number };
}

function parseSms(raw: string, trimmed: string): SmsScanPayload | null {
  const match = /^(?:sms|smsto|mms|mmsto):(.*)$/i.exec(trimmed);
  if (!match) return null;
  const rest = match[1];
  let numberPart: string;
  let body = '';
  const question = rest.indexOf('?');
  if (/^(?:smsto|mmsto):/i.test(trimmed)) {
    // SMSTO:number:message -- everything after the first colon is the message.
    const colon = rest.indexOf(':');
    numberPart = colon === -1 ? rest : rest.slice(0, colon);
    body = colon === -1 ? '' : rest.slice(colon + 1);
  } else if (question !== -1) {
    numberPart = rest.slice(0, question);
    const params = parseQuery(rest.slice(question + 1));
    if (params === null) return null;
    body = params.get('body') ?? '';
  } else {
    numberPart = rest;
  }
  const decoded = percentDecode(numberPart);
  const number = decoded === null ? '' : decoded.split(';')[0].trim();
  if (!PHONE_NUMBER.test(number)) return null;
  return { kind: 'sms', raw, sensitive: false, redactedRaw: raw, number, body };
}

function parseGeo(raw: string, trimmed: string): GeoScanPayload | null {
  const match = /^geo:(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)(?:,(-?\d+(?:\.\d+)?))?(?:[;?].*)?$/i.exec(trimmed);
  if (!match) return null;
  const latitude = Number(match[1]);
  const longitude = Number(match[2]);
  if (latitude < -90 || latitude > 90 || longitude < -180 || longitude > 180) return null;
  return { kind: 'geo', raw, sensitive: false, redactedRaw: raw, latitude, longitude, altitude: match[3] === undefined ? null : Number(match[3]) };
}

/** Classifies decoded QR/barcode text. Never throws; unrecognised or malformed input is `kind: 'text'`. */
export function classifyScanPayload(decoded: string): ScanPayload {
  const trimmed = decoded.trim();
  return (
    parseWifi(decoded, trimmed) ??
    parseOtp(decoded, trimmed) ??
    parseVcard(decoded, trimmed) ??
    parseMecard(decoded, trimmed) ??
    parseUrl(decoded, trimmed) ??
    parseMailto(decoded, trimmed) ??
    parseTel(decoded, trimmed) ??
    parseSms(decoded, trimmed) ??
    parseGeo(decoded, trimmed) ??
    text(decoded)
  );
}

const KIND_LABELS: Record<ScanPayloadKind, string> = {
  url: 'Web link',
  wifi: 'Wi-Fi network',
  contact: 'Contact',
  otp: 'One-time password',
  email: 'Email',
  phone: 'Phone number',
  sms: 'SMS',
  geo: 'Location',
  text: 'Text',
};

/** Human-readable name for a payload kind. */
export function scanPayloadKindLabel(kind: ScanPayloadKind): string {
  return KIND_LABELS[kind];
}
