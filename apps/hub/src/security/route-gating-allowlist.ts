import { HUB_INGEST_PATHS, HUB_OIDC_PATHS, INGEST_PATH_PREFIX } from '@dude/contracts/hub';
import type { HubCredentialType } from '@dude/contracts/hub';

/**
 * The documented anonymous-session allowlist of the whole-domain sign-in gate (32-SS1, PD-122, PD-144; Security Architecture, "Whole-domain
 * sign-in"). On the owner's domain every page and API requires a session; these are the ONLY exceptions, each with the reason it exists and
 * the credential type it declares instead. Milestone 843 creates the fixture with the exceptions known so far; Milestone 844 consumes it in
 * the enumerate-and-probe route-gating spec (every registered route is either gated or listed here, and every entry is a registered route).
 * Adding an entry is a security decision: it needs a reason here and a dated decision.
 *
 * Not listed on purpose, for Milestone 844 to settle with the probe spec rather than by assumption: `POST /bootstrap` (setup token, closed once an
 * owner exists), the device enrol, challenge, token and device-recovery routes (device keys and device tokens, no browser session by design),
 * and the `/api/v1/realtime` and `/api/v1/collab` WebSocket upgrades (their own authenticators).
 */
export interface GatingException {
  /** `*` means every method. */
  method: 'GET' | 'POST' | '*';
  /** An exact path, or a prefix ending in `/`. */
  path: string;
  match: 'exact' | 'prefix';
  /** What the route accepts instead of a session. */
  credentials: readonly HubCredentialType[];
  reason: string;
}

const P = '/api/v1';

export const ANONYMOUS_SESSION_ALLOWLIST: readonly GatingException[] = [
  { method: 'GET', path: `${P}/hello`, match: 'exact', credentials: ['none'], reason: 'The unauthenticated trust and compatibility advertisement a client reads before it can sign in (no secrets, no owner data).' },
  { method: 'POST', path: `${P}/auth/sign-in`, match: 'exact', credentials: ['none'], reason: 'Owner password sign-in: the way a session is created. Throttled per address and per owner.' },
  { method: 'POST', path: `${P}/auth/recover`, match: 'exact', credentials: ['none'], reason: 'Recovery-code sign-in (a recovery code and a new password). Throttled like sign-in.' },
  { method: 'POST', path: `${P}/owner/reset`, match: 'exact', credentials: ['none'], reason: 'Local owner reset by a single-use reset token minted on the Hub machine.' },
  { method: 'GET', path: HUB_OIDC_PATHS.status, match: 'exact', credentials: ['none'], reason: 'Whether the sign-in page may offer Google (two booleans).' },
  { method: 'POST', path: HUB_OIDC_PATHS.start, match: 'exact', credentials: ['none'], reason: 'Starts a Google sign-in flow (an authorization URL; reveals nothing about any account).' },
  { method: 'GET', path: HUB_OIDC_PATHS.callback, match: 'exact', credentials: ['none'], reason: 'The session-less OIDC callback; its credential headers are stripped and it only ever redirects (Milestone 842).' },
  { method: '*', path: INGEST_PATH_PREFIX, match: 'prefix', credentials: ['ingest-token'], reason: 'The token-only capture namespace (PD-119): scoped, hashed ingest tokens, never a session, with its own rate limits (Milestone 843).' },
];

/** Static assets (the SPA shell, hashed bundles, the service worker, the offline page) are public so the sign-in page can load; they are not API paths. */
export const STATIC_ASSETS_ARE_PUBLIC = true;

/** The exception covering a request, if any. Paths are compared without the query string. */
export function findGatingException(method: string, url: string): GatingException | undefined {
  const pathname = url.split('?')[0] ?? '/';
  return ANONYMOUS_SESSION_ALLOWLIST.find(
    (entry) => (entry.method === '*' || entry.method === method.toUpperCase()) && (entry.match === 'exact' ? pathname === entry.path : pathname.startsWith(entry.path)),
  );
}

/** The one ingest route this milestone ships (a registered route the prefix entry covers). */
export const INGEST_ALLOWLIST_PROBE_PATH = HUB_INGEST_PATHS.ping;
