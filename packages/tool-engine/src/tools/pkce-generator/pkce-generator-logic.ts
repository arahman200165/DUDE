import { hostCrypto } from "@dude/crypto/host";
/**
 * Pure, framework-free RFC 7636 PKCE code_verifier/code_challenge generation
 * used by the PKCE Generator tool. Verifier generation uses a CSPRNG with
 * rejection sampling (same approach as the Password Generator) rather than
 * Math.random(), since a code_verifier is a secret.
 */

import { base64url } from 'jose';

export type PkceMethod = 'S256' | 'plain';

const UNRESERVED_CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-._~';
export const MIN_VERIFIER_LENGTH = 43;
export const MAX_VERIFIER_LENGTH = 128;

function secureRandomInt(exclusiveMax: number): number {
  if (exclusiveMax <= 0) throw new Error('exclusiveMax must be positive');
  const limit = Math.floor(256 / exclusiveMax) * exclusiveMax;
  const bytes = new Uint8Array(1);
  let value: number;
  do {
    hostCrypto().getRandomValues(bytes);
    value = bytes[0];
  } while (value >= limit);
  return value % exclusiveMax;
}

/** Generates an RFC 7636 §4.1 code_verifier — a high-entropy cryptographic random string. */
export function generateCodeVerifier(length = 64): string {
  const clamped = Math.min(MAX_VERIFIER_LENGTH, Math.max(MIN_VERIFIER_LENGTH, Math.round(length)));
  let verifier = '';
  for (let i = 0; i < clamped; i++) {
    verifier += UNRESERVED_CHARS[secureRandomInt(UNRESERVED_CHARS.length)];
  }
  return verifier;
}

/** Computes the RFC 7636 §4.2 code_challenge for a given verifier and transform method. */
export async function computeCodeChallenge(verifier: string, method: PkceMethod): Promise<string> {
  if (method === 'plain') return verifier;
  const digest = await hostCrypto().subtle.digest('SHA-256', new TextEncoder().encode(verifier));
  return base64url.encode(new Uint8Array(digest));
}

export interface PkcePair {
  readonly verifier: string;
  readonly challenge: string;
  readonly method: PkceMethod;
}

export async function generatePkcePair(length = 64, method: PkceMethod = 'S256'): Promise<PkcePair> {
  const verifier = generateCodeVerifier(length);
  const challenge = await computeCodeChallenge(verifier, method);
  return { verifier, challenge, method };
}
