import type { HubOidcConfig } from '../../config/hub-config.js';
import { OIDC_CALLBACK_PATH, OIDC_SCOPE } from './constants.js';
import { allowedEgressHosts, createOidcEgress } from './egress.js';
import type { FetchLike, OidcEgress } from './egress.js';
import { createOidcFlows } from './flows.js';
import type { FlowRefusal, FlowStartInput, OidcFlowPurpose, OidcFlows } from './flows.js';
import { isWellFormedToken } from './pkce.js';
import { createOidcProvider } from './provider.js';
import type { OidcProvider } from './provider.js';
import { exchangeAuthorizationCode } from './token-exchange.js';
import { verifyIdToken } from './verify-id-token.js';
import type { IdTokenFailure, VerifiedIdentity } from './verify-id-token.js';
import type { Db } from '@dude/sqlite-store';

/**
 * The OIDC relying party (32-SS1, Milestone 841, PD-121, PD-145): builds the authorization request and completes the callback. It owns
 * no route, no cookie and no session (Milestone 842 wires those); it returns plain values and NEVER throws into a request path.
 *
 * - Off (`off`) when `hub.json` has no `oidc` block: the Hub is exactly what it was.
 * - `needs-attention` when configured but the client secret is absent or unreadable (after a restore, or before it was entered).
 * - `unreachable` when the provider cannot be reached or answers with something unusable: sign-in shows the password path instead.
 * - A completed callback returns the verified identity and the consumed flow; whether that `sub` is linked, and whether a link is
 *   allowed, is the caller's decision (Milestone 842), never this module's.
 */

export type ClientSecretResult = { status: 'ok'; secret: string } | { status: 'missing' } | { status: 'unreadable' };

export type OidcState = 'off' | 'ready' | 'unreachable' | 'needs-attention';
export interface OidcStatus { state: OidcState; /** A fixed sentence, never a secret, URL or provider text. */ detail: string }

export interface BeginInput { purpose: OidcFlowPurpose; ownerId?: string; sessionHash?: string; returnTo?: unknown }
export type BeginResult =
  | { status: 'ok'; authorizationUrl: string; expiresAt: string }
  | { status: 'off' | 'needs-attention' | 'unreachable' | 'busy' };

export interface CallbackFlow { purpose: OidcFlowPurpose; ownerId: string | null; sessionHash: string | null; returnTo: string }
export type CompleteFailure = IdTokenFailure | FlowRefusal | 'code-rejected' | 'invalid-response' | 'malformed-callback';
export type CompleteResult =
  | { status: 'ok'; flow: CallbackFlow; identity: VerifiedIdentity }
  | { status: 'failed'; reason: CompleteFailure; flow?: CallbackFlow }
  | { status: 'unreachable' | 'needs-attention'; flow?: CallbackFlow }
  | { status: 'off' };

export interface OidcClient {
  readonly enabled: boolean;
  readonly flows: OidcFlows;
  /** The redirect URI the owner registers in their Google OAuth client; null when off. */
  redirectUri(): string | null;
  /** Cheap and offline: configuration, secret presence and the last known provider reachability. */
  status(): OidcStatus;
  begin(input: BeginInput): Promise<BeginResult>;
  /** Spends the flow, exchanges the code and verifies the ID token. `code` and `state` are the raw callback query values. */
  complete(input: { state: unknown; code: unknown }): Promise<CompleteResult>;
}

export interface OidcClientOptions {
  config: HubOidcConfig | undefined;
  db: Db;
  /** Reads the client secret at the moment of use (it is never cached here). */
  readClientSecret: () => ClientSecretResult;
  /** Cheap presence check for `status()` and `begin()` (the DPAPI read spawns a process); defaults to a full read. */
  clientSecretPresent?: () => boolean;
  fetch?: FetchLike;
  now?: () => number;
  /** Specs: replaces the egress (host allowlist and bounds are then the caller's). */
  egress?: OidcEgress;
  flowTtlMs?: number;
  timeoutMs?: number;
}

const CODE_MAX = 2048;
const CODE_PATTERN = /^[^\u0000- \u007f]+$/;

export function createOidcClient(options: OidcClientOptions): OidcClient {
  const { config } = options;
  const now = options.now ?? Date.now;
  const flows = createOidcFlows({ db: options.db, now, ...(options.flowTtlMs !== undefined ? { ttlMs: options.flowTtlMs } : {}) });
  if (config === undefined) {
    return {
      enabled: false, flows,
      redirectUri: () => null,
      status: () => ({ state: 'off', detail: 'Google sign-in is not configured.' }),
      begin: () => Promise.resolve({ status: 'off' }),
      complete: () => Promise.resolve({ status: 'off' }),
    };
  }

  const egress = options.egress ?? createOidcEgress({ allowedHosts: allowedEgressHosts(config.issuer), ...(options.fetch ? { fetch: options.fetch } : {}), ...(options.timeoutMs !== undefined ? { timeoutMs: options.timeoutMs } : {}) });
  const provider: OidcProvider = createOidcProvider({ issuer: config.issuer, egress, now });
  const redirectUri = `${config.redirectOrigin}${OIDC_CALLBACK_PATH}`;
  const summary = (flow: { purpose: OidcFlowPurpose; ownerId: string | null; sessionHash: string | null; returnTo: string }): CallbackFlow =>
    ({ purpose: flow.purpose, ownerId: flow.ownerId, sessionHash: flow.sessionHash, returnTo: flow.returnTo });

  const safeSecret = (): ClientSecretResult => {
    try { return options.readClientSecret(); } catch { return { status: 'unreadable' }; }
  };

  const secretPresent = (): boolean => {
    try { return options.clientSecretPresent ? options.clientSecretPresent() : safeSecret().status === 'ok'; } catch { return false; }
  };

  return {
    enabled: true, flows,
    redirectUri: () => redirectUri,
    status() {
      if (!secretPresent()) return { state: 'needs-attention', detail: 'The Google client secret is not stored on this machine; enter it again.' };
      const snapshot = provider.snapshot();
      if (snapshot.discovery === 'unreachable') return { state: 'unreachable', detail: 'Google could not be reached or answered unexpectedly; the password still works.' };
      return { state: 'ready', detail: snapshot.discovery === 'ok' ? 'Google sign-in is configured and the provider answered.' : 'Google sign-in is configured.' };
    },
    async begin(input) {
      try {
        if (!secretPresent()) return { status: 'needs-attention' };
        const metadata = await provider.metadata();
        if (metadata.status !== 'ok') return { status: 'unreachable' };
        const start: FlowStartInput = input.purpose === 'link'
          ? { purpose: 'link', ownerId: input.ownerId ?? '', sessionHash: input.sessionHash ?? '', returnTo: input.returnTo }
          : { purpose: 'signin', returnTo: input.returnTo };
        if (start.purpose === 'link' && (start.ownerId === '' || start.sessionHash === '')) throw new Error('A link flow needs the owner and the session.');
        const started = flows.start(start);
        if (started.status !== 'ok') return { status: 'busy' };
        // No `hd` and no `login_hint`: the Hub never steers the account choice, it only checks the `sub` that comes back.
        const url = new URL(metadata.metadata.authorizationEndpoint);
        url.searchParams.set('response_type', 'code');
        url.searchParams.set('client_id', config.clientId);
        url.searchParams.set('redirect_uri', redirectUri);
        url.searchParams.set('scope', OIDC_SCOPE);
        url.searchParams.set('state', started.flow.state);
        url.searchParams.set('nonce', started.flow.nonce);
        url.searchParams.set('code_challenge', started.flow.codeChallenge);
        url.searchParams.set('code_challenge_method', 'S256');
        url.searchParams.set('prompt', 'select_account');
        return { status: 'ok', authorizationUrl: url.href, expiresAt: started.flow.expiresAt };
      } catch {
        return { status: 'unreachable' };
      }
    },
    async complete(input) {
      try {
        if (!isWellFormedToken(input.state, 32, 128)) return { status: 'failed', reason: 'malformed-callback' };
        const consumed = flows.consume(input.state);
        if (consumed.status !== 'ok') return { status: 'failed', reason: consumed.reason };
        const flow = summary(consumed.flow);
        const code = input.code;
        if (typeof code !== 'string' || code.length === 0 || code.length > CODE_MAX || !CODE_PATTERN.test(code)) return { status: 'failed', reason: 'malformed-callback', flow };
        const secret = safeSecret();
        if (secret.status !== 'ok') return { status: 'needs-attention', flow };
        const metadata = await provider.metadata();
        if (metadata.status !== 'ok') return { status: 'unreachable', flow };
        const exchanged = await exchangeAuthorizationCode({
          egress, metadata: metadata.metadata, clientId: config.clientId, clientSecret: secret.secret, redirectUri, code, codeVerifier: consumed.flow.codeVerifier,
        });
        if (exchanged.status === 'unreachable') return { status: 'unreachable', flow };
        if (exchanged.status === 'rejected') return { status: 'failed', reason: 'code-rejected', flow };
        if (exchanged.status === 'invalid-response') return { status: 'failed', reason: 'invalid-response', flow };
        const verified = await verifyIdToken(exchanged.idToken, { provider, issuer: config.issuer, clientId: config.clientId, expectedNonceHash: consumed.flow.nonceHash, now });
        if (verified.ok) return { status: 'ok', flow, identity: verified.identity };
        if (verified.reason === 'unreachable') return { status: 'unreachable', flow };
        return { status: 'failed', reason: verified.reason, flow };
      } catch {
        // Nothing here should throw; if something does (a closed database), the caller still gets a value and never the cause.
        return { status: 'unreachable' };
      }
    },
  };
}
