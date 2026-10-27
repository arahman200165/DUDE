import { transaction } from '@dude/sqlite-store';
import type { Db } from '@dude/sqlite-store';
import { OIDC_DEFAULT_RETURN_TO, OIDC_FLOW_RETAIN_MS, OIDC_FLOW_TTL_MS, OIDC_LINK_TTL_MS, OIDC_MAX_ACTIVE_FLOWS, OIDC_RETURN_TO_MAX } from './constants.js';
import { codeChallengeS256, generateCodeVerifier, generateNonce, generateState, isWellFormedToken, sha256Hex } from './pkce.js';

/**
 * Authorization flows (32-SS1, Milestone 841, PD-145): one `oidc_flows` row per authorization request.
 *
 * - `state` and `nonce` are stored only as SHA-256 hashes; the raw values exist in the browser redirect and in memory.
 * - The PKCE verifier is the one secret the Hub needs again (at the token exchange), so it is stored in the row, cleared the instant the
 *   flow is consumed, and the whole table is scrubbed from every backup.
 * - Consumption is strictly single use: one transaction checks the row and flips `consumed_at` guarded by `consumed_at IS NULL AND
 *   expires_at > now`, so a replayed or concurrent callback gets nothing. A flow is spent even when the provider then fails: the owner
 *   starts a new one.
 * - A `link` flow is bound to the owner and the session that started it; a `signin` flow to nobody. The callback itself is session-less.
 * - Unauthenticated `signin` starts are bounded by `OIDC_MAX_ACTIVE_FLOWS`.
 */

export type OidcFlowPurpose = 'signin' | 'link';

export type FlowStartInput = { purpose: 'signin'; returnTo?: unknown } | { purpose: 'link'; ownerId: string; sessionHash: string; returnTo?: unknown };

export interface StartedFlow {
  /** The raw values for the authorization request; the only place they exist outside the browser. */
  state: string;
  nonce: string;
  codeChallenge: string;
  expiresAt: string;
}

export type StartResult = { status: 'ok'; flow: StartedFlow } | { status: 'busy' };

export interface ConsumedFlow {
  purpose: OidcFlowPurpose;
  ownerId: string | null;
  sessionHash: string | null;
  returnTo: string;
  nonceHash: string;
  codeVerifier: string;
}

export type FlowRefusal = 'malformed' | 'unknown' | 'expired' | 'consumed';
export type ConsumeResult = { status: 'ok'; flow: ConsumedFlow } | { status: 'refused'; reason: FlowRefusal };

export interface VerifiedLinkIdentity { sub: string; email: string | undefined; issuer: string }
export type LinkClaimRefusal = 'malformed' | 'unknown' | 'expired' | 'completed' | 'wrong-owner' | 'wrong-session';
export type LinkClaimResult = { status: 'ok'; identity: VerifiedLinkIdentity; returnTo: string } | { status: 'refused'; reason: LinkClaimRefusal };

export interface OidcFlows {
  /**
   * Link leg one (Milestone 842): the callback of a `link` flow is cross-site and credential-less, so it can only record the VERIFIED
   * provider subject on the flow it just consumed and mint a one-time completion token (returned raw, stored hashed). Returns
   * `undefined` unless `state` names a consumed `link` flow with nothing recorded yet.
   */
  recordVerified(state: string, identity: VerifiedLinkIdentity): { linkToken: string; expiresAt: string } | undefined;
  /**
   * Link leg two: spends the completion token for the signed-in owner. The flow must belong to that owner and to the session that
   * started it (or one rotated from it: `sessionAllowed`); anything else is refused WITHOUT spending the token, so a stray request
   * cannot burn it, while a refused expiry or replay stays refused.
   */
  claimVerified(linkToken: unknown, caller: { ownerId: string; sessionAllowed: (startedSessionHash: string) => boolean }): LinkClaimResult;
  start(input: FlowStartInput): StartResult;
  /** Atomically spends the flow named by `state`. Every failure is the same shape to the caller; `reason` is for the audit trail only. */
  consume(state: unknown): ConsumeResult;
  /** Deletes expired flows and consumed rows past their retention; returns how many. */
  sweep(): number;
  /** Unexpired, unconsumed flows. */
  activeCount(): number;
}

/**
 * A same-site path the browser may be sent back to after sign-in. Anything else (an absolute URL, a scheme-relative `//host`, a
 * backslash form, control characters, an API path, an over-long value) becomes `/`: a silent fallback, so a probe learns nothing.
 */
export function sanitizeReturnTo(value: unknown): string {
  if (typeof value !== 'string' || value.length === 0 || value.length > OIDC_RETURN_TO_MAX) return OIDC_DEFAULT_RETURN_TO;
  if (!value.startsWith('/') || value.startsWith('//') || /[\\\u0000-\u001f\u007f\s]/.test(value)) return OIDC_DEFAULT_RETURN_TO;
  let parsed: URL;
  try { parsed = new URL(value, 'https://return-to.invalid'); } catch { return OIDC_DEFAULT_RETURN_TO; }
  if (parsed.origin !== 'https://return-to.invalid') return OIDC_DEFAULT_RETURN_TO;
  let decoded: string;
  try { decoded = decodeURIComponent(parsed.pathname); } catch { return OIDC_DEFAULT_RETURN_TO; }
  if (decoded.startsWith('//') || decoded.includes('\\') || /^\/api(\/|$)/i.test(decoded)) return OIDC_DEFAULT_RETURN_TO;
  return `${parsed.pathname}${parsed.search}`;
}

export interface OidcFlowsOptions {
  db: Db;
  now?: () => number;
  ttlMs?: number;
}

interface FlowRow {
  nonce_hash: string; code_verifier: string; purpose: OidcFlowPurpose; owner_id: string | null; session_hash: string | null;
  return_to: string; expires_at: string; consumed_at: string | null;
}

export function createOidcFlows(options: OidcFlowsOptions): OidcFlows {
  const { db } = options;
  const now = options.now ?? Date.now;
  const ttl = options.ttlMs ?? OIDC_FLOW_TTL_MS;
  const iso = (ms: number): string => new Date(ms).toISOString();

  const sweep = (): number => {
    const cutoff = iso(now() - OIDC_FLOW_RETAIN_MS);
    return Number(db.prepare('DELETE FROM oidc_flows WHERE expires_at < ? OR (consumed_at IS NOT NULL AND consumed_at < ?)').run(cutoff, cutoff).changes);
  };
  const activeCount = (): number =>
    Number((db.prepare('SELECT COUNT(*) AS n FROM oidc_flows WHERE consumed_at IS NULL AND expires_at > ?').get(iso(now())) as { n: number | bigint }).n);

  return {
    sweep,
    activeCount,
    recordVerified(state, identity) {
      if (!isWellFormedToken(state, 32, 128)) return undefined;
      const linkToken = generateState();
      const at = now();
      const recorded = db.prepare(
        `UPDATE oidc_flows SET verified_sub = ?, verified_email = ?, verified_issuer = ?, link_token_hash = ?, link_expires_at = ?
         WHERE state_hash = ? AND purpose = 'link' AND consumed_at IS NOT NULL AND verified_sub IS NULL`,
      ).run(identity.sub, identity.email ?? null, identity.issuer, sha256Hex(linkToken), iso(at + OIDC_LINK_TTL_MS), sha256Hex(state));
      return Number(recorded.changes) === 1 ? { linkToken, expiresAt: iso(at + OIDC_LINK_TTL_MS) } : undefined;
    },
    claimVerified(linkToken, caller) {
      if (!isWellFormedToken(linkToken, 32, 128)) return { status: 'refused', reason: 'malformed' };
      const tokenHash = sha256Hex(linkToken);
      const at = now();
      return transaction(db, (): LinkClaimResult => {
        const row = db.prepare(
          'SELECT owner_id, session_hash, return_to, verified_sub, verified_email, verified_issuer, link_expires_at, link_completed_at FROM oidc_flows WHERE link_token_hash = ?',
        ).get(tokenHash) as { owner_id: string | null; session_hash: string | null; return_to: string; verified_sub: string | null; verified_email: string | null; verified_issuer: string | null; link_expires_at: string | null; link_completed_at: string | null } | undefined;
        if (row === undefined || row.verified_sub === null || row.verified_issuer === null || row.owner_id === null || row.session_hash === null) return { status: 'refused', reason: 'unknown' };
        if (row.link_completed_at !== null) return { status: 'refused', reason: 'completed' };
        if (row.link_expires_at === null || row.link_expires_at <= iso(at)) return { status: 'refused', reason: 'expired' };
        if (row.owner_id !== caller.ownerId) return { status: 'refused', reason: 'wrong-owner' };
        if (!caller.sessionAllowed(row.session_hash)) return { status: 'refused', reason: 'wrong-session' };
        const spent = db.prepare('UPDATE oidc_flows SET link_completed_at = ? WHERE link_token_hash = ? AND link_completed_at IS NULL AND link_expires_at > ?').run(iso(at), tokenHash, iso(at));
        if (Number(spent.changes) !== 1) return { status: 'refused', reason: 'completed' };
        return { status: 'ok', identity: { sub: row.verified_sub, email: row.verified_email ?? undefined, issuer: row.verified_issuer }, returnTo: row.return_to };
      });
    },
    start(input) {
      sweep();
      if (activeCount() >= OIDC_MAX_ACTIVE_FLOWS) return { status: 'busy' };
      const state = generateState();
      const nonce = generateNonce();
      const verifier = generateCodeVerifier();
      const createdAt = now();
      const expiresAt = iso(createdAt + ttl);
      const link = input.purpose === 'link';
      db.prepare(
        'INSERT INTO oidc_flows(state_hash, nonce_hash, code_verifier, purpose, owner_id, session_hash, return_to, created_at, expires_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
      ).run(sha256Hex(state), sha256Hex(nonce), verifier, input.purpose, link ? input.ownerId : null, link ? input.sessionHash : null, sanitizeReturnTo(input.returnTo), iso(createdAt), expiresAt);
      return { status: 'ok', flow: { state, nonce, codeChallenge: codeChallengeS256(verifier), expiresAt } };
    },
    consume(state) {
      if (!isWellFormedToken(state, 32, 128)) return { status: 'refused', reason: 'malformed' };
      const stateHash = sha256Hex(state);
      const at = now();
      return transaction(db, (): ConsumeResult => {
        const row = db.prepare('SELECT nonce_hash, code_verifier, purpose, owner_id, session_hash, return_to, expires_at, consumed_at FROM oidc_flows WHERE state_hash = ?').get(stateHash) as FlowRow | undefined;
        if (row === undefined) return { status: 'refused', reason: 'unknown' };
        if (row.consumed_at !== null) return { status: 'refused', reason: 'consumed' };
        if (row.expires_at <= iso(at)) return { status: 'refused', reason: 'expired' };
        const spent = db.prepare("UPDATE oidc_flows SET consumed_at = ?, code_verifier = '' WHERE state_hash = ? AND consumed_at IS NULL AND expires_at > ?").run(iso(at), stateHash, iso(at));
        if (Number(spent.changes) !== 1) return { status: 'refused', reason: 'consumed' };
        return {
          status: 'ok',
          flow: { purpose: row.purpose, ownerId: row.owner_id, sessionHash: row.session_hash, returnTo: row.return_to, nonceHash: row.nonce_hash, codeVerifier: row.code_verifier },
        };
      });
    },
  };
}
