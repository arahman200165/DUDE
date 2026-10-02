import { hostCrypto } from "@dude/crypto/host";
/**
 * Pure, framework-free RFC 7636 PKCE round-trip verification used by the
 * PKCE Verifier tool. Recomputes the code_challenge from a given
 * code_verifier and checks it against the challenge that was actually sent.
 */

import { base64url } from 'jose';

export type PkceMethod = 'S256' | 'plain';

const UNRESERVED_PATTERN = /^[A-Za-z0-9\-._~]+$/;
const MIN_VERIFIER_LENGTH = 43;
const MAX_VERIFIER_LENGTH = 128;

async function computeCodeChallenge(verifier: string, method: PkceMethod): Promise<string> {
  if (method === 'plain') return verifier;
  const digest = await hostCrypto().subtle.digest('SHA-256', new TextEncoder().encode(verifier));
  return base64url.encode(new Uint8Array(digest));
}

export interface PkceVerifyRequest {
  readonly verifier: string;
  readonly challenge: string;
  readonly method: PkceMethod;
}

export type PkceVerifyResult =
  | {
      readonly ok: true;
      readonly matches: boolean;
      readonly recomputedChallenge: string;
      readonly warnings: readonly string[];
    }
  | { readonly ok: false; readonly error: string };

export async function verifyPkce(request: PkceVerifyRequest): Promise<PkceVerifyResult> {
  const verifier = request.verifier.trim();
  const challenge = request.challenge.trim();

  if (verifier === '') return { ok: false, error: 'Enter a code_verifier.' };
  if (challenge === '') return { ok: false, error: 'Enter a code_challenge to compare against.' };

  const warnings: string[] = [];
  if (!UNRESERVED_PATTERN.test(verifier)) {
    warnings.push('code_verifier contains characters outside RFC 7636\'s unreserved set ([A-Za-z0-9-._~]).');
  }
  if (verifier.length < MIN_VERIFIER_LENGTH || verifier.length > MAX_VERIFIER_LENGTH) {
    warnings.push(`code_verifier is ${verifier.length} characters — RFC 7636 recommends 43-128.`);
  }

  const recomputedChallenge = await computeCodeChallenge(verifier, request.method);
  return { ok: true, matches: recomputedChallenge === challenge, recomputedChallenge, warnings };
}
