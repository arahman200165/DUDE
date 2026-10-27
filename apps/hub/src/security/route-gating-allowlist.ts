import { HUB_INGEST_PATHS, HUB_OIDC_PATHS, INGEST_PATH_PREFIX } from '@dude/contracts/hub';
import type { HubCredentialType } from '@dude/contracts/hub';

/**
 * The documented anonymous-session allowlist of the whole-domain sign-in gate (32-SS1, PD-122, PD-144; Security Architecture, "Whole-domain
 * sign-in"). On the owner's domain every page and API requires a session; these are the ONLY exceptions, each with the reason it exists and
 * the credential type it declares instead. Milestone 843 created the fixture; Milestone 844 settled the routes it left open (setup, device
 * enrol, challenge and token, the public TLS pins) and consumes it in the enumerate-and-probe spec `server/route-gating.spec.ts`: every
 * registered route is either gated or listed here, every entry is a registered route, and every entry behaves anonymously as documented.
 * Adding an entry is a security decision: it needs a reason here and a dated decision.
 *
 * Gated on purpose, so NOT listed (an anonymous probe must get 401 or 403): every other route, the device-recovery routes (device token), the
 * `/api/v1/realtime` and `/api/v1/collab` WebSocket upgrades (their own authenticators run BEFORE the upgrade, so a missing credential is a
 * plain 401 and never a socket) and every method but GET/HEAD outside `/api` (404).
 */
export type GatingCategory = 'hello' | 'sign-in' | 'recovery' | 'setup' | 'oidc' | 'device-enrol' | 'tls-pins' | 'ingest';

export interface GatingException {
  /** `*` means every method. */
  method: 'GET' | 'POST' | '*';
  /** An exact path, or a prefix ending in `/`. */
  path: string;
  match: 'exact' | 'prefix';
  category: GatingCategory;
  /** What the route accepts instead of a session. */
  credentials: readonly HubCredentialType[];
  /** One line: why this route must be reachable without a session. */
  reason: string;
}

const P = '/api/v1';

export const ANONYMOUS_SESSION_ALLOWLIST: readonly GatingException[] = [
  { method: 'GET', path: `${P}/hello`, match: 'exact', category: 'hello', credentials: ['none'], reason: 'The unauthenticated trust and compatibility advertisement a client reads before it can sign in (no secrets, no owner data).' },
  { method: 'GET', path: `${P}/tls/certificates`, match: 'exact', category: 'tls-pins', credentials: ['none'], reason: 'The public certificate pins a client verifies before it trusts the Hub (public data only, never a key).' },
  { method: 'POST', path: `${P}/bootstrap`, match: 'exact', category: 'setup', credentials: ['setup-token'], reason: 'First-owner setup by the single-use setup token minted on the Hub machine; closed (409) once an owner exists.' },
  { method: 'POST', path: `${P}/auth/sign-in`, match: 'exact', category: 'sign-in', credentials: ['none'], reason: 'Owner password sign-in: the way a session is created. Throttled per address and per owner.' },
  { method: 'POST', path: `${P}/auth/recover`, match: 'exact', category: 'recovery', credentials: ['none'], reason: 'Recovery-code sign-in (a recovery code and a new password). Throttled like sign-in.' },
  { method: 'POST', path: `${P}/owner/reset`, match: 'exact', category: 'recovery', credentials: ['none'], reason: 'Local owner reset by a single-use reset token minted on the Hub machine.' },
  { method: 'GET', path: HUB_OIDC_PATHS.status, match: 'exact', category: 'oidc', credentials: ['none'], reason: 'Whether the sign-in page may offer Google (two booleans).' },
  { method: 'POST', path: HUB_OIDC_PATHS.start, match: 'exact', category: 'oidc', credentials: ['none'], reason: 'Starts a Google sign-in flow (an authorization URL; reveals nothing about any account).' },
  { method: 'GET', path: HUB_OIDC_PATHS.callback, match: 'exact', category: 'oidc', credentials: ['none'], reason: 'The session-less OIDC callback; its credential headers are stripped and it only ever redirects (Milestone 842).' },
  { method: 'POST', path: `${P}/devices/enroll`, match: 'exact', category: 'device-enrol', credentials: ['none'], reason: 'A new device enrols with a single-use pairing code and proof of key possession; no browser session exists for a device.' },
  { method: 'POST', path: `${P}/auth/device/challenge`, match: 'exact', category: 'device-enrol', credentials: ['none'], reason: 'A device asks for a fresh challenge to sign with its enrolled key (step one of the device token exchange).' },
  { method: 'POST', path: `${P}/auth/device/token`, match: 'exact', category: 'device-enrol', credentials: ['none'], reason: 'A device exchanges a signed challenge for a device token (proof of key possession, no session).' },
  { method: '*', path: INGEST_PATH_PREFIX, match: 'prefix', category: 'ingest', credentials: ['ingest-token'], reason: 'The token-only capture namespace (PD-119): scoped, hashed ingest tokens, never a session, with its own rate limits (Milestone 843).' },
];

/** Static assets (the SPA shell, hashed bundles, the service worker, the Hub-offline page) are public so the sign-in page can load; they are not API paths. */
export const STATIC_ASSETS_ARE_PUBLIC = true;

/** A request the static handler serves without a session: GET or HEAD anywhere outside `/api`. */
export function isPublicStaticRequest(method: string, url: string): boolean {
  const pathname = url.split('?')[0] ?? '/';
  const m = method.toUpperCase();
  return STATIC_ASSETS_ARE_PUBLIC && (m === 'GET' || m === 'HEAD') && pathname !== '/api' && !pathname.startsWith('/api/');
}

/** The exception covering a request, if any. Paths are compared without the query string. */
export function findGatingException(method: string, url: string): GatingException | undefined {
  const pathname = url.split('?')[0] ?? '/';
  return ANONYMOUS_SESSION_ALLOWLIST.find(
    (entry) => (entry.method === '*' || entry.method === method.toUpperCase()) && (entry.match === 'exact' ? pathname === entry.path : pathname.startsWith(entry.path)),
  );
}

/** The one ingest route this milestone ships (a registered route the prefix entry covers). */
export const INGEST_ALLOWLIST_PROBE_PATH = HUB_INGEST_PATHS.ping;
