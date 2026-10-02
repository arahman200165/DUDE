import type { FastifyInstance, FastifyRequest } from 'fastify';
import { HUB_API_PREFIX } from '@dude/contracts/hub';
import type { HubErrorCode } from '@dude/contracts/hub';
import { envelope } from '../server/errors.js';
import { SESSION_COOKIE, parseCookies } from './cookies.js';
import type { HostGuard } from './host-guard.js';

export type CredentialKind = 'bearer' | 'cookie' | 'none';

export interface CredentialClassification {
  kind: CredentialKind;
  /** Both a bearer header and the session cookie were presented. */
  conflict: boolean;
  /** The session cookie appeared more than once. */
  duplicateSession: boolean;
  bearerToken?: string;
  sessionCookie?: string;
}

const BEARER = /^Bearer\s+(\S+)\s*$/i;

/** Classifies the credential a request carries. Later route auth reuses this. */
export function classifyCredential(request: Pick<FastifyRequest, 'headers'>): CredentialClassification {
  const authorization = request.headers.authorization;
  const bearer = typeof authorization === 'string' ? BEARER.exec(authorization) : null;
  const cookies = parseCookies(request.headers.cookie);
  const sessionCookie = cookies.values.get(SESSION_COOKIE);
  const hasBearer = bearer !== null;
  const hasCookie = sessionCookie !== undefined;
  const result: CredentialClassification = {
    kind: hasBearer ? 'bearer' : hasCookie ? 'cookie' : 'none',
    conflict: hasBearer && hasCookie,
    duplicateSession: cookies.duplicates.has(SESSION_COOKIE),
  };
  if (bearer?.[1] !== undefined) result.bearerToken = bearer[1];
  if (sessionCookie !== undefined) result.sessionCookie = sessionCookie;
  return result;
}

export type CsrfVerifier = (sessionCookieValue: string, csrfHeader: string) => boolean | Promise<boolean>;

/** Default until sessions land (M634): no CSRF token can be valid. */
export const rejectingCsrfVerifier: CsrfVerifier = () => false;

export const CSRF_HEADER = 'x-dude-csrf';
const BROWSER_FETCH_HEADERS = ['sec-fetch-site', 'sec-fetch-mode', 'sec-fetch-dest', 'sec-fetch-user'] as const;
const MUTATING = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

export interface RequestGuardOptions {
  hostGuard: HostGuard;
  csrfVerifier?: CsrfVerifier;
}

interface Rejection { status: number; code: HubErrorCode; message: string }

function header(request: FastifyRequest, name: string): string | undefined {
  const value = request.headers[name];
  return typeof value === 'string' ? value : undefined;
}

function hasBody(request: FastifyRequest): boolean {
  const length = request.headers['content-length'];
  return (length !== undefined && length !== '0') || request.headers['transfer-encoding'] !== undefined;
}

declare module 'fastify' {
  interface FastifyContextConfig {
    /**
     * The route authenticates with something other than a session (password, recovery code, setup/reset token), so a
     * stale session cookie must not demand a CSRF token. Origin and Fetch-Metadata checks still apply.
     */
    credentialless?: boolean;
  }
}

async function evaluate(request: FastifyRequest, options: RequestGuardOptions, credentialless: boolean): Promise<Rejection | null> {
  const credential = classifyCredential(request);
  if (credential.conflict) return { status: 400, code: 'bad-request', message: 'Send one credential type per request.' };
  if (credential.duplicateSession) return { status: 400, code: 'bad-request', message: 'The request is not valid.' };

  const contentType = header(request, 'content-type');
  if (hasBody(request) && !(contentType !== undefined && /^application\/json\s*(;|$)/i.test(contentType))) {
    return { status: 415, code: 'bad-request', message: 'Content-Type must be application/json.' };
  }

  const site = header(request, 'sec-fetch-site');
  if (credential.kind === 'bearer') {
    const mode = header(request, 'sec-fetch-mode');
    if ((mode === 'navigate' || mode === 'cors') && site === 'cross-site') {
      return { status: 403, code: 'forbidden', message: 'Cross-site requests are not allowed.' };
    }
    return null;
  }

  // Browser-ish ('cookie' or 'none'): same-origin only.
  const host = header(request, 'host');
  const origin = header(request, 'origin');
  if (credential.kind === 'none' && origin === undefined) {
    // Credential-less POSTs (sign-in, device enrollment, challenge/token) also come from non-browser clients such as
    // the Desktop Agent, which never sends Origin. A browser always sends Origin on a cross-origin POST and every
    // modern one sends Fetch-Metadata (Sec-Fetch-*) on all requests, so "no Origin AND no Sec-Fetch-*" identifies a
    // non-browser client and keeps CSRF protection: any browser-initiated request either carries a checked Origin or
    // is refused here. Cookie-credential requests never take this path (they always need Origin plus the CSRF token).
    // The Host allowlist (DNS rebinding) has already run in the onRequest host guard; it is re-checked for clarity.
    if (BROWSER_FETCH_HEADERS.some((name) => header(request, name) !== undefined)) {
      return { status: 403, code: 'forbidden', message: 'Cross-origin requests are not allowed.' };
    }
    return host !== undefined && options.hostGuard.isAllowed(host) ? null : { status: 403, code: 'forbidden', message: 'Cross-origin requests are not allowed.' };
  }
  if (origin === undefined || host === undefined || !options.hostGuard.isAllowed(host) || origin.toLowerCase() !== `https://${host.toLowerCase()}`) {
    return { status: 403, code: 'forbidden', message: 'Cross-origin requests are not allowed.' };
  }
  if (site !== undefined && site !== 'same-origin') {
    return { status: 403, code: 'forbidden', message: 'Cross-site requests are not allowed.' };
  }
  if (credential.kind === 'cookie' && !credentialless) {
    const csrf = header(request, CSRF_HEADER);
    if (csrf === undefined || csrf.length === 0 || credential.sessionCookie === undefined) {
      return { status: 403, code: 'forbidden', message: 'Missing CSRF token.' };
    }
    let ok = false;
    try { ok = await (options.csrfVerifier ?? rejectingCsrfVerifier)(credential.sessionCookie, csrf); } catch { ok = false; }
    if (!ok) return { status: 403, code: 'forbidden', message: 'Invalid CSRF token.' };
  }
  return null;
}

/** CSRF/Origin/Fetch-Metadata checks for mutating methods under `/api`, keyed on the credential type. */
export function registerRequestGuard(app: FastifyInstance, options: RequestGuardOptions): void {
  const prefix = HUB_API_PREFIX.slice(0, HUB_API_PREFIX.indexOf('/', 1));
  app.addHook('onRequest', async (request, reply) => {
    const pathname = request.url.split('?')[0] ?? '/';
    if (!MUTATING.has(request.method) || !(pathname === prefix || pathname.startsWith(`${prefix}/`))) return;
    const rejection = await evaluate(request, options, request.routeOptions.config?.credentialless === true);
    if (rejection === null) return;
    return reply.code(rejection.status).type('application/json').header('Cache-Control', 'no-store').send(envelope(rejection.code, rejection.message));
  });
}
