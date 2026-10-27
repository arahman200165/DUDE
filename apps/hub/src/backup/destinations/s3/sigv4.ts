import { createHash, createHmac } from 'node:crypto';

/**
 * AWS Signature Version 4, header authentication (32-SS1, Milestone 848). Dependency-free; the only primitives are SHA-256 and
 * HMAC-SHA-256 from `node:crypto`. Proven against the published AWS examples in `sigv4.spec.ts` (the S3 documentation's
 * `examplebucket` requests and the AWS SigV4 test-suite `get-vanilla` vector), and verified independently, request by request, by
 * the fake S3 server the destination specs run against.
 *
 * S3 rules this signer follows (and the generic `service` vectors do not exercise differently): the canonical URI is the request
 * path exactly as sent, with each segment encoded ONCE (S3 never double-encodes), the payload hash is the real SHA-256 of the body
 * sent as `x-amz-content-sha256` (this client never uses `UNSIGNED-PAYLOAD`), and every header in the map (plus `host` and
 * `x-amz-date`) is signed.
 */
export interface SigV4Credentials {
  accessKeyId: string;
  secretAccessKey: string;
  sessionToken?: string;
}

export const EMPTY_PAYLOAD_SHA256 = 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855';

export const sha256Hex = (bytes: Uint8Array | string): string => createHash('sha256').update(bytes).digest('hex');
const hmac = (key: Uint8Array | string, data: string): Buffer => createHmac('sha256', key).update(data, 'utf8').digest();

/** RFC 3986 percent-encoding of everything except the unreserved set (`A-Z a-z 0-9 - _ . ~`). */
export function uriEncode(value: string, keepSlash = false): string {
  let out = '';
  for (const byte of Buffer.from(value, 'utf8')) {
    const char = String.fromCharCode(byte);
    if (/[A-Za-z0-9\-_.~]/.test(char) || (keepSlash && char === '/')) out += char;
    else out += `%${byte.toString(16).toUpperCase().padStart(2, '0')}`;
  }
  return out;
}

/** `20150830T123600Z` and `20150830`. */
export function amzDate(date: Date): { stamp: string; day: string } {
  const stamp = date.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
  return { stamp, day: stamp.slice(0, 8) };
}

export interface CanonicalInput {
  method: string;
  /** The path exactly as sent (already percent-encoded). */
  path: string;
  /** Query parameters as decoded name/value pairs. */
  query: Array<[string, string]>;
  /** Lower-cased header name to value; every entry is signed. */
  headers: Record<string, string>;
  payloadSha256: string;
}

export function canonicalRequest(input: CanonicalInput): { text: string; signedHeaders: string } {
  const names = Object.keys(input.headers).map((n) => n.toLowerCase()).sort();
  const lowered: Record<string, string> = {};
  for (const [name, value] of Object.entries(input.headers)) lowered[name.toLowerCase()] = value.trim().replace(/\s+/g, ' ');
  const canonicalHeaders = names.map((n) => `${n}:${lowered[n] ?? ''}\n`).join('');
  const signedHeaders = names.join(';');
  const query = input.query
    .map(([k, v]) => [uriEncode(k), uriEncode(v)] as const)
    .sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : a[1] < b[1] ? -1 : a[1] > b[1] ? 1 : 0))
    .map(([k, v]) => `${k}=${v}`)
    .join('&');
  const text = [input.method.toUpperCase(), input.path === '' ? '/' : input.path, query, canonicalHeaders, signedHeaders, input.payloadSha256].join('\n');
  return { text, signedHeaders };
}

export const credentialScope = (day: string, region: string, service: string): string => `${day}/${region}/${service}/aws4_request`;

export const stringToSign = (stamp: string, scope: string, canonical: string): string => `AWS4-HMAC-SHA256\n${stamp}\n${scope}\n${sha256Hex(canonical)}`;

export function signingKey(secretAccessKey: string, day: string, region: string, service: string): Buffer {
  return hmac(hmac(hmac(hmac(`AWS4${secretAccessKey}`, day), region), service), 'aws4_request');
}

export interface SignInput {
  method: string;
  url: URL;
  /** Headers to send and sign, other than `host`, `x-amz-date`, `x-amz-content-sha256` and `x-amz-security-token`, which are added. */
  headers?: Record<string, string>;
  payloadSha256: string;
  region: string;
  service?: string;
  credentials: SigV4Credentials;
  date: Date;
}

export interface SignedRequest {
  /** Every header to send, including `authorization`. */
  headers: Record<string, string>;
  signature: string;
  canonicalRequest: string;
}

/** Signs a request; `url.pathname` must already be encoded the way it will be sent. */
export function signRequest(input: SignInput): SignedRequest {
  const service = input.service ?? 's3';
  const { stamp, day } = amzDate(input.date);
  const headers: Record<string, string> = {};
  for (const [name, value] of Object.entries(input.headers ?? {})) headers[name.toLowerCase()] = value;
  headers['host'] = input.url.host;
  headers['x-amz-date'] = stamp;
  headers['x-amz-content-sha256'] = input.payloadSha256;
  if (input.credentials.sessionToken !== undefined && input.credentials.sessionToken.length > 0) headers['x-amz-security-token'] = input.credentials.sessionToken;
  const query: Array<[string, string]> = [...input.url.searchParams.entries()];
  const canonical = canonicalRequest({ method: input.method, path: input.url.pathname, query, headers, payloadSha256: input.payloadSha256 });
  const scope = credentialScope(day, input.region, service);
  const signature = createHmac('sha256', signingKey(input.credentials.secretAccessKey, day, input.region, service)).update(stringToSign(stamp, scope, canonical.text), 'utf8').digest('hex');
  headers['authorization'] = `AWS4-HMAC-SHA256 Credential=${input.credentials.accessKeyId}/${scope}, SignedHeaders=${canonical.signedHeaders}, Signature=${signature}`;
  return { headers, signature, canonicalRequest: canonical.text };
}
