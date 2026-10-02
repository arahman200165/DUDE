import { readFileSync, rmSync } from 'node:fs';
import path from 'node:path';
import { HubApiError, HubProtocolError, createHubClient } from '@dude/api-client';
import type { HubTransport } from '@dude/api-client';
import type { AgentHubBootstrapResult, AgentHubStatus } from '@dude/contracts';
import { HUB_MIN_CLIENT_PROTOCOL, HUB_PROTOCOL_VERSION } from '@dude/contracts/hub';
import { HubManagerError } from './errors.js';
import { PIN_MISMATCH_CODE, createPinnedTransport } from './pinned-transport.js';
import type { PinnedTarget } from './pinned-transport.js';
import { probePin } from './probe.js';
import type { PinProbe } from './probe.js';

/** The nonce shape the Hub CLI accepts (`NONCE_PATTERN` in apps/hub); also keeps the file name free of separators. */
export const HANDOFF_NONCE_PATTERN = /^[A-Za-z0-9_-]{16,64}$/;
export const HANDOFF_MAX_AGE_MS = 120_000;
const CLOCK_SKEW_MS = 30_000;
export const SESSION_COOKIE = '__Host-dude_session';
export const CSRF_HEADER = 'x-dude-csrf';

export interface Handoff { token: string; spkiSha256: string; port: number; hubInstanceId: string; createdAt: string }

export interface BootstrapLocalParams { nonce: string; environmentName: string; ownerDisplayName: string; password: string }

export interface BootstrapLocalDeps {
  now: () => Date;
  /** `%LOCALAPPDATA%`; defaults to the process environment. */
  localAppData?: () => string | undefined;
  /** Test seams. */
  probe?: (host: string, port: number, spki: string) => Promise<PinProbe>;
  createTransport?: (target: PinnedTarget) => HubTransport;
  /** Pairs this device through the normal enrollment path. */
  enroll: (pairingString: string) => Promise<AgentHubStatus>;
  /** Holds an owner bearer for the user after enrollment. */
  ownerSignIn: (password: string) => Promise<unknown>;
  status: () => AgentHubStatus;
}

const fail = (code: HubManagerError['code'], message: string): HubManagerError => new HubManagerError(code, message);

export const handoffPath = (localAppData: string, nonce: string): string => path.join(localAppData, 'DUDE', `hub-handoff-${nonce}.json`);

/** Reads the hand-off and deletes it immediately, whatever happens. The token is never returned to a caller that may log it. */
export function consumeHandoff(params: { nonce: string }, deps: Pick<BootstrapLocalDeps, 'now' | 'localAppData'>): Handoff {
  if (!HANDOFF_NONCE_PATTERN.test(params.nonce)) throw fail('handoff-missing', 'The setup hand-off was not found.');
  const base = (deps.localAppData ?? ((): string | undefined => process.env['LOCALAPPDATA']))();
  if (!base) throw fail('handoff-missing', 'The setup hand-off was not found.');
  const file = handoffPath(base, params.nonce);
  let text: string;
  try {
    text = readFileSync(file, 'utf8');
  } catch {
    throw fail('handoff-missing', 'The setup hand-off was not found.');
  } finally {
    try { rmSync(file, { force: true }); } catch { /* best effort: the token also expires on the Hub */ }
  }
  let parsed: Partial<Handoff> & { v?: unknown };
  try { parsed = JSON.parse(text) as typeof parsed; } catch { throw fail('handoff-missing', 'The setup hand-off could not be read.'); }
  if (parsed.v !== 1 || typeof parsed.token !== 'string' || !/^[A-Za-z0-9_-]{43}$/.test(parsed.token)
    || typeof parsed.spkiSha256 !== 'string' || !/^[A-Za-z0-9_-]{43}$/.test(parsed.spkiSha256)
    || typeof parsed.port !== 'number' || !Number.isInteger(parsed.port) || parsed.port < 1 || parsed.port > 65535
    || typeof parsed.hubInstanceId !== 'string' || typeof parsed.createdAt !== 'string') {
    throw fail('handoff-missing', 'The setup hand-off could not be read.');
  }
  const created = Date.parse(parsed.createdAt);
  const age = deps.now().getTime() - created;
  if (!Number.isFinite(created) || age > HANDOFF_MAX_AGE_MS || age < -CLOCK_SKEW_MS) throw fail('handoff-expired', 'The setup hand-off expired. Start the setup again.');
  return { token: parsed.token, spkiSha256: parsed.spkiSha256, port: parsed.port, hubInstanceId: parsed.hubInstanceId, createdAt: parsed.createdAt };
}

const isTls = (error: unknown): boolean => {
  const code = (error as { code?: unknown } | null)?.code;
  return code === PIN_MISMATCH_CODE || (typeof code === 'string' && /^(ERR_TLS_|ERR_SSL_|CERT_|DEPTH_ZERO|SELF_SIGNED|UNABLE_TO_)/.test(code));
};

/** Typed failures; a Hub API error stays a `HubApiError` so the RPC layer reports it as `hub-<code>`. */
function mapError(error: unknown): HubManagerError | HubApiError {
  if (error instanceof HubManagerError) return error;
  if (error instanceof HubApiError) return error.status === 409 ? fail('already-bootstrapped', 'This Hub already has an owner.') : error;
  if (error instanceof HubProtocolError) return fail('incompatible', 'The server did not answer like a DUDE Hub.');
  if (isTls(error)) return fail('tls-pin-mismatch', 'The Hub certificate does not match the setup hand-off.');
  return fail('hub-unreachable', error instanceof Error ? error.message : 'The Hub could not be reached.');
}

/** Adds fixed headers to every request and records the session cookie the Hub sets. */
function cookieTransport(inner: HubTransport, extra: Record<string, string>, capture?: (setCookie: string) => void): HubTransport {
  return {
    async request(req) {
      const res = await inner.request({ ...req, headers: { ...req.headers, ...extra } });
      const cookie = res.headers['set-cookie'];
      if (cookie !== undefined && capture) capture(cookie);
      return res;
    },
  };
}

/**
 * First-run local Hub setup (PD-028): consume the ACL'd hand-off, bootstrap over a transport pinned to the hand-off's key,
 * mint the first pairing code through a throwaway cookie session (a non-browser client of the normal sign-in) and enroll
 * this device through the NORMAL pairing path, then sign the owner in so the user lands signed in. The setup token and the
 * password are never logged and the token is never persisted (it lives in a local variable of this call).
 */
export async function bootstrapLocalHub(params: BootstrapLocalParams, deps: BootstrapLocalDeps): Promise<AgentHubBootstrapResult> {
  const handoff = consumeHandoff(params, deps);
  const host = '127.0.0.1';

  let probe: PinProbe;
  try {
    probe = await (deps.probe ?? probePin)(host, handoff.port, handoff.spkiSha256);
  } catch (error) {
    throw fail('hub-unreachable', error instanceof Error ? error.message : 'The Hub could not be reached.');
  }
  if (!probe.matches) throw fail('tls-pin-mismatch', 'The local Hub presented a different certificate than the setup hand-off pins. Nothing was sent.');

  const target: PinnedTarget = { host, port: handoff.port, ca: [probe.certPem], pins: [handoff.spkiSha256] };
  const makeTransport = deps.createTransport ?? ((t: PinnedTarget): HubTransport => createPinnedTransport(t));
  const clientOptions = { clientProtocol: HUB_PROTOCOL_VERSION, minHubProtocol: HUB_MIN_CLIENT_PROTOCOL };
  const api = createHubClient(makeTransport(target), clientOptions);

  let recoveryCodes: string[];
  try {
    const hello = await api.hello();
    if (api.compatibility(hello) !== 'compatible') throw fail('incompatible', 'This Hub and this DUDE build speak incompatible protocol versions.');
    if (hello.tls.spkiSha256 !== handoff.spkiSha256) throw fail('tls-pin-mismatch', 'The Hub reports a different key than the setup hand-off pins.');
    if (hello.bootstrapped) throw fail('already-bootstrapped', 'This Hub already has an owner.');
    const created = await api.bootstrap({ setupToken: handoff.token, ownerDisplayName: params.ownerDisplayName, environmentName: params.environmentName, password: params.password });
    recoveryCodes = created.recoveryCodes;
  } catch (error) {
    throw mapError(error);
  }

  // From here the Hub has an owner and the recovery codes exist: a failure is reported alongside them.
  const origin = `https://${host}:${handoff.port}`;
  const held: { cookie: string | null } = { cookie: null };
  let followUpError: { code: string; message: string } | undefined;
  try {
    const session = createHubClient(cookieTransport(makeTransport(target), { origin }, (setCookie) => {
      const match = new RegExp(`${SESSION_COOKIE}=([^;\\s]+)`).exec(setCookie);
      if (match?.[1]) held.cookie = `${SESSION_COOKIE}=${match[1]}`;
    }), clientOptions);
    const signedIn = await session.signIn(params.password);
    if (held.cookie === null) throw fail('pairing-rejected', 'The Hub did not start a session.');
    const authed = createHubClient(cookieTransport(makeTransport(target), { origin, cookie: held.cookie, [CSRF_HEADER]: signedIn.csrfToken }), clientOptions);
    try {
      const pairing = await authed.createPairingCode(undefined, { host });
      await deps.enroll(pairing.pairingString);
    } finally {
      await authed.signOut().catch(() => undefined);
    }
    await deps.ownerSignIn(params.password);
  } catch (error) {
    const mapped = mapError(error);
    followUpError = mapped instanceof HubApiError ? { code: `hub-${mapped.code}`, message: mapped.message } : { code: mapped.code, message: mapped.message };
  }
  return { recoveryCodes, status: deps.status(), ...(followUpError ? { followUpError } : {}) };
}
