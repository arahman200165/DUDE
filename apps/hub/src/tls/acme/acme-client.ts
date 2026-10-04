/**
 * A dependency-free ACME (RFC 8555) client for the Hub: http-01 issuance with an ES256 account key.
 *
 * The caller owns the challenge responder (`onChallenge` / `onChallengeDone`) and the account key. Nothing
 * here retries rate limits; `urn:ietf:params:acme:error:rateLimited` surfaces as an AcmeError carrying
 * `retryAfterSeconds`. Credentials (account key, key authorizations) are never logged.
 */
import { X509Certificate } from 'node:crypto';
import type { KeyObject } from 'node:crypto';
import { isIpLiteral } from '../x509.js';
import { base64url, jwkOf, keyAuthorization, signJws } from './jws.js';
import type { FlattenedJws } from './jws.js';

export class AcmeError extends Error {
  readonly type: string;
  readonly detail: string;
  readonly status: number;
  /** Seconds from a `Retry-After` header, when the server sent one. */
  readonly retryAfterSeconds?: number;
  constructor(type: string, detail: string, status: number, retryAfterSeconds?: number) {
    super(`${type}: ${detail}${retryAfterSeconds !== undefined ? ` (retry after ${retryAfterSeconds}s)` : ''}`);
    this.name = 'AcmeError';
    this.type = type;
    this.detail = detail;
    this.status = status;
    if (retryAfterSeconds !== undefined) this.retryAfterSeconds = retryAfterSeconds;
  }
}

export const ACME_RATE_LIMITED = 'urn:ietf:params:acme:error:rateLimited';

export interface AcmeClientOptions {
  directoryUrl: string;
  accountKey: KeyObject;
  fetchImpl?: typeof fetch;
  now?: () => number;
  sleep?: (ms: number) => Promise<void>;
  userAgent?: string;
  /** Poll attempts per authorization / order before giving up (default 30). */
  maxPollAttempts?: number;
  /** Poll interval when the server sends no Retry-After (default 2000 ms). */
  pollIntervalMs?: number;
}

export interface ChallengeInfo { domain: string; token: string; keyAuthorization: string }

export interface IssueInput {
  names: string[];
  csrDer: Buffer;
  onChallenge(challenge: ChallengeInfo): void | Promise<void>;
  onChallengeDone(challenge: ChallengeInfo): void | Promise<void>;
}

export interface IssueResult { chainPem: string; orderUrl: string; notAfter?: string }

export interface AcmeClient {
  ensureAccount(input: { contactEmail?: string; termsOfServiceAgreed: boolean }): Promise<{ kid: string }>;
  issue(input: IssueInput): Promise<IssueResult>;
}

interface Directory { newNonce: string; newAccount: string; newOrder: string }
interface AcmeResponse { status: number; headers: Headers; body: Record<string, unknown>; text: string }
interface Challenge { type: string; url: string; token: string; status?: string; error?: { type?: string; detail?: string } }
interface Authorization { status: string; identifier: { type: string; value: string }; challenges: Challenge[]; wildcard?: boolean }
interface Order { status: string; authorizations: string[]; finalize: string; certificate?: string; error?: { type?: string; detail?: string } }

const isLoopback = (host: string): boolean => host === 'localhost' || host === '[::1]' || host === '::1' || /^127(\.\d{1,3}){3}$/.test(host);

function assertAllowedUrl(url: string): void {
  const parsed = new URL(url);
  if (parsed.protocol === 'https:') return;
  if (parsed.protocol === 'http:' && isLoopback(parsed.hostname)) return;
  throw new AcmeError('dude:insecure-url', `ACME URLs must be https (got ${parsed.protocol}//${parsed.hostname})`, 0);
}

export function parseRetryAfter(value: string | null, nowMs: number): number | undefined {
  if (!value) return undefined;
  if (/^\d+$/.test(value.trim())) return Number(value.trim());
  const at = Date.parse(value);
  return Number.isNaN(at) ? undefined : Math.max(0, Math.ceil((at - nowMs) / 1000));
}

export function createAcmeClient(options: AcmeClientOptions): AcmeClient {
  const { directoryUrl, accountKey } = options;
  const fetchImpl = options.fetchImpl ?? fetch;
  const now = options.now ?? Date.now;
  const sleep = options.sleep ?? ((ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms)));
  const userAgent = options.userAgent ?? 'dude-hub-acme/1';
  const maxPolls = options.maxPollAttempts ?? 30;
  const pollInterval = options.pollIntervalMs ?? 2000;
  const jwk = jwkOf(accountKey);

  let directory: Directory | null = null;
  let nonce: string | null = null;
  let kid: string | null = null;

  async function http(url: string, init: RequestInit): Promise<AcmeResponse> {
    assertAllowedUrl(url);
    const response = await fetchImpl(url, { ...init, headers: { 'User-Agent': userAgent, ...(init.headers as Record<string, string> | undefined) } });
    const fresh = response.headers.get('Replay-Nonce');
    if (fresh) nonce = fresh;
    const text = init.method === 'HEAD' ? '' : await response.text();
    let body: Record<string, unknown> = {};
    if (text && (response.headers.get('Content-Type') ?? '').includes('json')) {
      try { body = JSON.parse(text) as Record<string, unknown>; } catch { body = {}; }
    }
    return { status: response.status, headers: response.headers, body, text };
  }

  function toError(response: AcmeResponse): AcmeError {
    const type = typeof response.body.type === 'string' ? response.body.type : 'dude:http-error';
    const detail = typeof response.body.detail === 'string' ? response.body.detail : `HTTP ${response.status}`;
    return new AcmeError(type, detail, response.status, parseRetryAfter(response.headers.get('Retry-After'), now()));
  }

  async function getDirectory(): Promise<Directory> {
    if (directory) return directory;
    assertAllowedUrl(directoryUrl);
    const response = await http(directoryUrl, { method: 'GET' });
    if (response.status !== 200) throw toError(response);
    const { newNonce, newAccount, newOrder } = response.body as Partial<Directory>;
    if (!newNonce || !newAccount || !newOrder) throw new AcmeError('dude:bad-directory', 'The ACME directory is missing required endpoints', response.status);
    directory = { newNonce, newAccount, newOrder };
    return directory;
  }

  async function takeNonce(): Promise<string> {
    if (!nonce) {
      const dir = await getDirectory();
      const response = await http(dir.newNonce, { method: 'HEAD' });
      if (!nonce) throw new AcmeError('dude:no-nonce', 'The ACME server returned no Replay-Nonce', response.status);
    }
    const taken = nonce;
    nonce = null;
    return taken;
  }

  /** Signed POST with one automatic retry on badNonce. `payload === ''` is POST-as-GET. */
  async function post(url: string, payload: unknown, auth: 'jwk' | 'kid', extraHeaders: Record<string, string> = {}): Promise<AcmeResponse> {
    for (let attempt = 0; ; attempt++) {
      const header: Record<string, unknown> = { alg: 'ES256', nonce: await takeNonce(), url };
      if (auth === 'jwk') header.jwk = jwk;
      else {
        if (!kid) throw new AcmeError('dude:no-account', 'ensureAccount must run before this request', 0);
        header.kid = kid;
      }
      const jws: FlattenedJws = signJws({ key: accountKey, protectedHeader: header, payload });
      const response = await http(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/jose+json', ...extraHeaders },
        body: JSON.stringify(jws),
      });
      if (response.status >= 200 && response.status < 300) return response;
      const error = toError(response);
      if (error.type === 'urn:ietf:params:acme:error:badNonce' && attempt === 0) continue;
      throw error;
    }
  }

  async function ensureAccount({ contactEmail, termsOfServiceAgreed }: { contactEmail?: string; termsOfServiceAgreed: boolean }): Promise<{ kid: string }> {
    if (termsOfServiceAgreed !== true) throw new AcmeError('dude:terms-not-agreed', 'The operator must explicitly agree to the ACME CA terms of service', 0);
    if (kid) return { kid };
    const dir = await getDirectory();
    let response: AcmeResponse;
    try {
      response = await post(dir.newAccount, { onlyReturnExisting: true }, 'jwk');
    } catch (error) {
      if (!(error instanceof AcmeError) || error.type !== 'urn:ietf:params:acme:error:accountDoesNotExist') throw error;
      response = await post(
        dir.newAccount,
        { termsOfServiceAgreed: true, ...(contactEmail ? { contact: [`mailto:${contactEmail}`] } : {}) },
        'jwk',
      );
    }
    const location = response.headers.get('Location');
    if (!location) throw new AcmeError('dude:no-account-url', 'The ACME server returned no account Location', response.status);
    kid = location;
    return { kid };
  }

  async function poll<T extends { status: string }>(url: string, done: (value: T) => boolean, what: string): Promise<T> {
    for (let attempt = 0; attempt < maxPolls; attempt++) {
      const response = await post(url, '', 'kid');
      const value = response.body as unknown as T;
      if (done(value)) return value;
      if (value.status === 'invalid') return value;
      const retry = parseRetryAfter(response.headers.get('Retry-After'), now());
      await sleep((retry !== undefined ? retry * 1000 : pollInterval));
    }
    throw new AcmeError('dude:poll-timeout', `Timed out waiting for the ${what} after ${maxPolls} attempts`, 0);
  }

  async function issue(input: IssueInput): Promise<IssueResult> {
    if (!kid) throw new AcmeError('dude:no-account', 'ensureAccount must run before issue', 0);
    if (input.names.length === 0) throw new AcmeError('dude:no-names', 'At least one name is required', 0);
    const dir = await getDirectory();
    const orderResponse = await post(
      dir.newOrder,
      { identifiers: input.names.map((value) => ({ type: isIpLiteral(value) ? 'ip' : 'dns', value })) },
      'kid',
    );
    const orderUrl = orderResponse.headers.get('Location');
    if (!orderUrl) throw new AcmeError('dude:no-order-url', 'The ACME server returned no order Location', orderResponse.status);
    const order = orderResponse.body as unknown as Order;

    const started: ChallengeInfo[] = [];
    try {
      const pending: { challenge: Challenge; domain: string }[] = [];
      for (const authzUrl of order.authorizations ?? []) {
        const authz = (await post(authzUrl, '', 'kid')).body as unknown as Authorization;
        if (authz.status === 'valid') continue;
        const challenge = authz.challenges?.find((c) => c.type === 'http-01');
        if (!challenge) {
          const offered = (authz.challenges ?? []).map((c) => c.type).join(', ') || 'none';
          throw new AcmeError('dude:no-http-01', `The CA offers no http-01 challenge for ${authz.identifier.value}${authz.wildcard ? ' (wildcard names need dns-01)' : ''}; offered: ${offered}`, 0);
        }
        const info: ChallengeInfo = { domain: authz.identifier.value, token: challenge.token, keyAuthorization: keyAuthorization(challenge.token, jwk) };
        started.push(info);
        await input.onChallenge(info);
        pending.push({ challenge, domain: authz.identifier.value });
      }
      for (const { challenge } of pending) await post(challenge.url, {}, 'kid');

      // Poll each authorization via the order's authorization URLs that were pending.
      for (const authzUrl of order.authorizations ?? []) {
        const authz = await poll<Authorization>(authzUrl, (a) => a.status === 'valid', 'authorization');
        if (authz.status !== 'valid') {
          const failed = authz.challenges?.find((c) => c.error)?.error;
          throw new AcmeError(failed?.type ?? 'dude:authorization-invalid', failed?.detail ?? `Authorization for ${authz.identifier?.value} is ${authz.status}`, 0);
        }
      }

      const ready = await poll<Order>(orderUrl, (o) => o.status === 'ready' || o.status === 'valid', 'order to become ready');
      if (ready.status === 'invalid') throw new AcmeError(ready.error?.type ?? 'dude:order-invalid', ready.error?.detail ?? 'The order became invalid', 0);
      let finalOrder: Order = ready;
      if (ready.status !== 'valid') {
        const finalizeResponse = await post(ready.finalize, { csr: base64url(input.csrDer) }, 'kid');
        finalOrder = finalizeResponse.body as unknown as Order;
        if (finalOrder.status !== 'valid') finalOrder = await poll<Order>(orderUrl, (o) => o.status === 'valid', 'order to be issued');
      }
      if (finalOrder.status !== 'valid' || !finalOrder.certificate) {
        throw new AcmeError(finalOrder.error?.type ?? 'dude:order-invalid', finalOrder.error?.detail ?? `The order ended ${finalOrder.status}`, 0);
      }

      const certResponse = await post(finalOrder.certificate, '', 'kid', { Accept: 'application/pem-certificate-chain' });
      const chainPem = certResponse.text;
      const firstPem = /-----BEGIN CERTIFICATE-----[\s\S]+?-----END CERTIFICATE-----/.exec(chainPem)?.[0];
      if (!firstPem) throw new AcmeError('dude:bad-certificate', 'The ACME server returned no certificate', certResponse.status);
      const notAfter = new Date(new X509Certificate(firstPem).validTo).toISOString();
      return { chainPem, orderUrl, notAfter };
    } finally {
      for (const info of started) {
        try { await input.onChallengeDone(info); } catch { /* cleanup must not mask the issuance outcome */ }
      }
    }
  }

  return { ensureAccount, issue };
}
