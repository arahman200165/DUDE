import { HubApiError, HubProtocolError, createHubClient } from '@dude/api-client';
import type { HubTransport } from '@dude/api-client';
import { HUB_MIN_CLIENT_PROTOCOL, HUB_PROTOCOL_VERSION } from '@dude/contracts/hub';
import type { ReachabilityEchoResponse } from '@dude/contracts/hub';
import { parseHubPublicUrl } from '@dude/contracts';
import { HubManagerError } from './errors.js';
import { PIN_MISMATCH_CODE } from './pinned-transport.js';
import type { PinnedTarget } from './pinned-transport.js';

export const ECHO_TIMEOUT_MS = 10_000;
export const ECHO_MAX_RESPONSE_BYTES = 16 * 1024;

export type ReachabilityEchoResult = ReachabilityEchoResponse & { rttMs: number };

export interface PublicEchoInput {
  publicUrl: string;
  /** Accepted SPKI pins of the enrolled Hub (active, next, proxy). */
  pins: readonly string[];
  /** Runs the request with a device token; the caller refreshes the token on a 401. */
  withToken: <T>(fn: (token: string) => Promise<T>) => Promise<T>;
  makeTransport: (target: PinnedTarget) => HubTransport;
  /** Monotonic milliseconds. */
  clock?: () => number;
}

/**
 * One `GET /reachability/echo` against the Hub's PUBLIC origin. TLS: the enrollment pins first, else ordinary system CA
 * validation for the requested host (`allowSystemTrust`); a peer that is neither fails `untrusted-tls`. Verification is never
 * disabled. No redirect is followed (a 3xx is a protocol error), 10 s, 16 KiB.
 */
export async function reachabilityEchoViaPublicUrl(input: PublicEchoInput): Promise<ReachabilityEchoResult> {
  const parsed = parseHubPublicUrl(input.publicUrl);
  if (!parsed.ok) throw new HubManagerError('invalid-url', parsed.error);
  const clock = input.clock ?? ((): number => performance.now());
  const target: PinnedTarget = {
    host: parsed.host, port: parsed.port, pins: input.pins,
    allowSystemTrust: true, timeoutMs: ECHO_TIMEOUT_MS, maxResponseBytes: ECHO_MAX_RESPONSE_BYTES,
  };
  const api = createHubClient(input.makeTransport(target), { clientProtocol: HUB_PROTOCOL_VERSION, minHubProtocol: HUB_MIN_CLIENT_PROTOCOL });
  try {
    return await input.withToken(async (token) => {
      const started = clock();
      const response = await api.reachabilityEcho(token);
      return { ...response, rttMs: Math.max(0, Math.round(clock() - started)) };
    });
  } catch (error) {
    if (error instanceof HubApiError || error instanceof HubProtocolError || error instanceof HubManagerError) throw error;
    const code = (error as { code?: unknown } | null)?.code;
    if (code === PIN_MISMATCH_CODE || (typeof code === 'string' && /^(ERR_TLS_|ERR_SSL_|CERT_|DEPTH_ZERO|SELF_SIGNED|UNABLE_TO_|HOSTNAME_MISMATCH|ERR_OSSL)/.test(code))) {
      throw new HubManagerError('untrusted-tls', 'The certificate presented on that address is neither the Hub certificate this device pinned nor one a public authority vouches for.');
    }
    if (code === 'too-large') throw new HubManagerError('hub-unreachable', 'The response was larger than expected, so it was discarded.');
    throw new HubManagerError('hub-unreachable', error instanceof Error ? error.message : 'The Hub could not be reached on that address.');
  }
}
