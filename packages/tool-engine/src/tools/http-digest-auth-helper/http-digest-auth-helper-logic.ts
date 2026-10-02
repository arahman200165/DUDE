import { hostCrypto } from "@dude/crypto/host";
/**
 * Pure, framework-free RFC 7616 (and legacy RFC 2617) HTTP Digest
 * Authentication computation used by the HTTP Digest Auth Helper tool.
 * Implements the HA1/HA2/response chain for MD5, MD5-sess, SHA-256, and
 * SHA-256-sess, with and without qop, including the auth-int body-hashing
 * variant.
 */

import { md5 } from 'js-md5';

export interface WwwAuthenticateChallenge {
  readonly realm?: string;
  readonly nonce?: string;
  readonly qop?: string;
  readonly opaque?: string;
  readonly algorithm?: string;
}

export type ChallengeParseResult = { readonly ok: true; readonly value: WwwAuthenticateChallenge } | { readonly ok: false; readonly error: string };

export function parseWwwAuthenticateChallenge(header: string): ChallengeParseResult {
  const withoutScheme = header.trim().replace(/^WWW-Authenticate:\s*/i, '').replace(/^Digest\s+/i, '');
  if (withoutScheme === '') return { ok: false, error: 'Paste a WWW-Authenticate: Digest challenge.' };

  const directives: Record<string, string> = {};
  const pattern = /(\w+)\s*=\s*(?:"([^"]*)"|([^,\s]+))/g;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(withoutScheme)) !== null) {
    directives[match[1].toLowerCase()] = match[2] !== undefined ? match[2] : match[3];
  }

  if (Object.keys(directives).length === 0) return { ok: false, error: 'Could not find any directives (realm=..., nonce=..., etc).' };

  return {
    ok: true,
    value: { realm: directives['realm'], nonce: directives['nonce'], qop: directives['qop'], opaque: directives['opaque'], algorithm: directives['algorithm'] },
  };
}

export type DigestAlgorithm = 'MD5' | 'MD5-sess' | 'SHA-256' | 'SHA-256-sess';
export type DigestQop = 'auth' | 'auth-int';

export interface DigestComputeParams {
  readonly username: string;
  readonly password: string;
  readonly method: string;
  readonly uri: string;
  readonly realm: string;
  readonly nonce: string;
  readonly nc?: string;
  readonly cnonce?: string;
  readonly qop?: DigestQop;
  readonly algorithm?: DigestAlgorithm;
  readonly entityBody?: string;
  readonly opaque?: string;
}

export interface DigestComputeResult {
  readonly ha1: string;
  readonly ha2: string;
  readonly response: string;
  readonly authorizationHeader: string;
}

export type DigestComputeOutcome = { readonly ok: true; readonly value: DigestComputeResult } | { readonly ok: false; readonly error: string };

async function hashHex(baseAlgorithm: 'MD5' | 'SHA-256', input: string): Promise<string> {
  if (baseAlgorithm === 'MD5') return md5(input);
  const digest = await hostCrypto().subtle.digest('SHA-256', new TextEncoder().encode(input));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

export async function computeDigestResponse(params: DigestComputeParams): Promise<DigestComputeOutcome> {
  if (!params.username) return { ok: false, error: 'Username is required.' };
  if (!params.realm) return { ok: false, error: 'Realm is required.' };
  if (!params.nonce) return { ok: false, error: 'Nonce is required.' };
  if (!params.uri) return { ok: false, error: 'Digest URI is required.' };
  if (!params.method) return { ok: false, error: 'HTTP method is required.' };
  if (params.qop && (!params.nc || !params.cnonce)) return { ok: false, error: 'nc and cnonce are required when qop is set.' };

  const algorithm = params.algorithm ?? 'MD5';
  const baseAlgorithm: 'MD5' | 'SHA-256' = algorithm.startsWith('SHA-256') ? 'SHA-256' : 'MD5';
  const isSess = algorithm.endsWith('-sess');

  if (isSess && !params.cnonce) return { ok: false, error: 'cnonce is required for a "-sess" algorithm.' };

  let ha1 = await hashHex(baseAlgorithm, `${params.username}:${params.realm}:${params.password}`);
  if (isSess) ha1 = await hashHex(baseAlgorithm, `${ha1}:${params.nonce}:${params.cnonce}`);

  const ha2 =
    params.qop === 'auth-int'
      ? await hashHex(baseAlgorithm, `${params.method}:${params.uri}:${await hashHex(baseAlgorithm, params.entityBody ?? '')}`)
      : await hashHex(baseAlgorithm, `${params.method}:${params.uri}`);

  const response = params.qop
    ? await hashHex(baseAlgorithm, `${ha1}:${params.nonce}:${params.nc}:${params.cnonce}:${params.qop}:${ha2}`)
    : await hashHex(baseAlgorithm, `${ha1}:${params.nonce}:${ha2}`);

  const parts = [
    `username="${params.username}"`,
    `realm="${params.realm}"`,
    `nonce="${params.nonce}"`,
    `uri="${params.uri}"`,
    `algorithm=${algorithm}`,
    `response="${response}"`,
  ];
  if (params.qop) {
    parts.push(`qop=${params.qop}`, `nc=${params.nc}`, `cnonce="${params.cnonce}"`);
  }
  if (params.opaque) parts.push(`opaque="${params.opaque}"`);

  return { ok: true, value: { ha1, ha2, response, authorizationHeader: `Digest ${parts.join(', ')}` } };
}
