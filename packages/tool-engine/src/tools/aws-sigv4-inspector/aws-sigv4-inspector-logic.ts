import { hostCrypto } from "@dude/crypto/host";
/**
 * Pure, framework-free AWS Signature Version 4 canonical-request/
 * string-to-sign/signing-key computation, used by the AWS Signature V4
 * Inspector tool to both verify an existing signed request and build a new
 * one from scratch. Implements AWS's documented four-task signing process
 * (canonical request, string to sign, signing key, signature) — hand-rolled
 * rather than a dependency, cross-validated in the spec against an
 * independently computed reference chain for AWS's well-known worked
 * example (IAM ListUsers, access key AKIDEXAMPLE).
 */

export type SigV4Result<T> = { readonly ok: true; readonly value: T } | { readonly ok: false; readonly error: string };

type HeaderPair = readonly [string, string];

async function hashSha256Hex(input: string): Promise<string> {
  const digest = await hostCrypto().subtle.digest('SHA-256', new TextEncoder().encode(input));
  return bytesToHex(new Uint8Array(digest));
}

function bytesToHex(bytes: Uint8Array): string {
  return [...bytes].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

async function hmacSha256(key: Uint8Array, data: string): Promise<Uint8Array> {
  const cryptoKey = await hostCrypto().subtle.importKey('raw', key as BufferSource, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const signature = await hostCrypto().subtle.sign('HMAC', cryptoKey, new TextEncoder().encode(data));
  return new Uint8Array(signature);
}

const UNRESERVED_BYTE_PATTERN = /^[A-Za-z0-9\-._~]$/;

function uriEncode(value: string, encodeSlash: boolean): string {
  let result = '';
  for (const byte of new TextEncoder().encode(value)) {
    const char = String.fromCharCode(byte);
    if (UNRESERVED_BYTE_PATTERN.test(char)) {
      result += char;
    } else if (char === '/' && !encodeSlash) {
      result += char;
    } else {
      result += `%${byte.toString(16).toUpperCase().padStart(2, '0')}`;
    }
  }
  return result;
}

/**
 * AWS double-URI-encodes path segments for every service except Amazon S3.
 * `pathname` (e.g. from `URL.pathname`) arrives already percent-encoded per
 * wire format, so each segment is decoded back to its logical form first —
 * otherwise a pre-existing "%20" would itself get re-encoded to "%2520"
 * before SigV4's own single/double encoding is even applied.
 */
function canonicalUri(pathname: string, isS3: boolean): string {
  if (pathname === '') return '/';
  const singleEncoded = pathname
    .split('/')
    .map((segment) => {
      let decoded = segment;
      try {
        decoded = decodeURIComponent(segment);
      } catch {
        // Malformed percent-encoding — encode the segment as given.
      }
      return uriEncode(decoded, true);
    })
    .join('/');
  return isS3 ? singleEncoded : uriEncode(singleEncoded, false);
}

function canonicalQueryString(params: readonly HeaderPair[]): string {
  const encoded = params.map(([key, value]) => [uriEncode(key, true), uriEncode(value, true)] as const);
  encoded.sort(([keyA, valueA], [keyB, valueB]) => (keyA === keyB ? (valueA < valueB ? -1 : valueA > valueB ? 1 : 0) : keyA < keyB ? -1 : 1));
  return encoded.map(([key, value]) => `${key}=${value}`).join('&');
}

function trimHeaderValue(value: string): string {
  return value.trim().replace(/\s+/g, ' ');
}

function canonicalHeaders(headers: readonly HeaderPair[]): { readonly block: string; readonly signedHeaders: string } {
  const merged = new Map<string, string>();
  for (const [name, value] of headers) {
    const key = name.toLowerCase();
    const trimmed = trimHeaderValue(value);
    merged.set(key, merged.has(key) ? `${merged.get(key)},${trimmed}` : trimmed);
  }
  const sortedNames = [...merged.keys()].sort();
  return { block: sortedNames.map((name) => `${name}:${merged.get(name)}\n`).join(''), signedHeaders: sortedNames.join(';') };
}

export interface CanonicalRequestInput {
  readonly method: string;
  readonly path: string;
  readonly queryParams: readonly HeaderPair[];
  readonly headers: readonly HeaderPair[];
  readonly payloadHash: string;
  readonly isS3: boolean;
}

export interface CanonicalRequestOutput {
  readonly canonicalRequest: string;
  readonly signedHeaders: string;
}

export function buildCanonicalRequest(input: CanonicalRequestInput): CanonicalRequestOutput {
  const { block, signedHeaders } = canonicalHeaders(input.headers);
  const canonicalRequest = [
    input.method.toUpperCase(),
    canonicalUri(input.path, input.isS3),
    canonicalQueryString(input.queryParams),
    block,
    signedHeaders,
    input.payloadHash,
  ].join('\n');
  return { canonicalRequest, signedHeaders };
}

export function buildStringToSign(amzDate: string, credentialScope: string, canonicalRequestHash: string): string {
  return ['AWS4-HMAC-SHA256', amzDate, credentialScope, canonicalRequestHash].join('\n');
}

export async function deriveSigningKey(secretKey: string, dateStamp: string, region: string, service: string): Promise<Uint8Array> {
  const kDate = await hmacSha256(new TextEncoder().encode(`AWS4${secretKey}`), dateStamp);
  const kRegion = await hmacSha256(kDate, region);
  const kService = await hmacSha256(kRegion, service);
  return hmacSha256(kService, 'aws4_request');
}

export async function computeSignatureHex(stringToSign: string, signingKey: Uint8Array): Promise<string> {
  return bytesToHex(await hmacSha256(signingKey, stringToSign));
}

export function formatAmzDate(date: Date): string {
  return date.toISOString().replace(/[:-]|\.\d{3}/g, '');
}

export { hashSha256Hex };

export interface BuildSignedRequestParams {
  readonly method: string;
  readonly url: string;
  readonly headers: readonly HeaderPair[];
  readonly payload: string;
  readonly accessKey: string;
  readonly secretKey: string;
  readonly region: string;
  readonly service: string;
  readonly sessionToken?: string;
  readonly amzDate?: string;
  readonly unsignedPayload?: boolean;
}

export interface BuildSignedRequestResult {
  readonly authorizationHeader: string;
  readonly canonicalRequest: string;
  readonly stringToSign: string;
  readonly amzDate: string;
  readonly signedHeaders: string;
  readonly signature: string;
}

export async function buildSignedRequest(params: BuildSignedRequestParams): Promise<SigV4Result<BuildSignedRequestResult>> {
  if (!params.accessKey) return { ok: false, error: 'Access key is required.' };
  if (!params.secretKey) return { ok: false, error: 'Secret key is required.' };
  if (!params.region) return { ok: false, error: 'Region is required.' };
  if (!params.service) return { ok: false, error: 'Service is required.' };

  let url: URL;
  try {
    url = new URL(params.url);
  } catch {
    return { ok: false, error: 'Not a valid URL.' };
  }

  const amzDate = params.amzDate ?? formatAmzDate(new Date());
  const dateStamp = amzDate.slice(0, 8);
  const payloadHash = params.unsignedPayload ? 'UNSIGNED-PAYLOAD' : await hashSha256Hex(params.payload);

  const signedRequestHeaders: HeaderPair[] = [...params.headers, ['host', url.host], ['x-amz-date', amzDate]];
  if (params.sessionToken) signedRequestHeaders.push(['x-amz-security-token', params.sessionToken]);

  const { canonicalRequest, signedHeaders } = buildCanonicalRequest({
    method: params.method,
    path: url.pathname,
    queryParams: [...url.searchParams.entries()],
    headers: signedRequestHeaders,
    payloadHash,
    isS3: params.service === 's3',
  });

  const canonicalRequestHash = await hashSha256Hex(canonicalRequest);
  const credentialScope = `${dateStamp}/${params.region}/${params.service}/aws4_request`;
  const stringToSign = buildStringToSign(amzDate, credentialScope, canonicalRequestHash);
  const signingKey = await deriveSigningKey(params.secretKey, dateStamp, params.region, params.service);
  const signature = await computeSignatureHex(stringToSign, signingKey);

  const authorizationHeader = `AWS4-HMAC-SHA256 Credential=${params.accessKey}/${credentialScope}, SignedHeaders=${signedHeaders}, Signature=${signature}`;

  return { ok: true, value: { authorizationHeader, canonicalRequest, stringToSign, amzDate, signedHeaders, signature } };
}

export interface InspectSignedRequestParams {
  readonly method: string;
  readonly url: string;
  readonly headers: readonly HeaderPair[];
  readonly payload: string;
  readonly secretKey: string;
  readonly unsignedPayload?: boolean;
}

export interface InspectSignedRequestResult {
  readonly canonicalRequest: string;
  readonly stringToSign: string;
  readonly expectedSignature: string;
  readonly providedSignature: string;
  readonly matches: boolean;
  readonly accessKey: string;
  readonly credentialScope: string;
}

export async function inspectSignedRequest(params: InspectSignedRequestParams): Promise<SigV4Result<InspectSignedRequestResult>> {
  const authEntry = params.headers.find(([name]) => name.toLowerCase() === 'authorization');
  if (!authEntry) return { ok: false, error: 'No Authorization header found among the given headers.' };

  const credentialMatch = /Credential=([^,\s]+)/.exec(authEntry[1]);
  const signedHeadersMatch = /SignedHeaders=([^,\s]+)/.exec(authEntry[1]);
  const signatureMatch = /Signature=([0-9a-f]+)/.exec(authEntry[1]);
  if (!credentialMatch || !signedHeadersMatch || !signatureMatch) {
    return { ok: false, error: 'Could not parse Credential/SignedHeaders/Signature from the Authorization header.' };
  }

  const [accessKey, dateStamp, region, service] = credentialMatch[1].split('/');
  if (!accessKey || !dateStamp || !region || !service) return { ok: false, error: 'Malformed credential scope — expected accessKey/date/region/service/aws4_request.' };

  const amzDateEntry = params.headers.find(([name]) => name.toLowerCase() === 'x-amz-date');
  if (!amzDateEntry) return { ok: false, error: 'No x-amz-date header found among the given headers.' };

  let url: URL;
  try {
    url = new URL(params.url);
  } catch {
    return { ok: false, error: 'Not a valid URL.' };
  }

  const signedHeaderNames = signedHeadersMatch[1].split(';');
  const relevantHeaders = params.headers.filter(([name]) => signedHeaderNames.includes(name.toLowerCase()));
  const payloadHash = params.unsignedPayload ? 'UNSIGNED-PAYLOAD' : await hashSha256Hex(params.payload);

  const credentialScope = `${dateStamp}/${region}/${service}/aws4_request`;
  const { canonicalRequest } = buildCanonicalRequest({
    method: params.method,
    path: url.pathname,
    queryParams: [...url.searchParams.entries()],
    headers: relevantHeaders,
    payloadHash,
    isS3: service === 's3',
  });

  const canonicalRequestHash = await hashSha256Hex(canonicalRequest);
  const stringToSign = buildStringToSign(amzDateEntry[1], credentialScope, canonicalRequestHash);
  const signingKey = await deriveSigningKey(params.secretKey, dateStamp, region, service);
  const expectedSignature = await computeSignatureHex(stringToSign, signingKey);

  return {
    ok: true,
    value: { canonicalRequest, stringToSign, expectedSignature, providedSignature: signatureMatch[1], matches: expectedSignature === signatureMatch[1], accessKey, credentialScope },
  };
}
