import { Value } from 'typebox/value';
import type { HubTransport } from '@dude/api-client';
import type { AgentDiagnostics, AgentDiagnosticsState, AgentHubStatus, AgentSyncStatus } from '@dude/contracts';
import { HUB_MIN_CLIENT_PROTOCOL, HUB_PROTOCOL_VERSION, HelloResponse, checkProtocolCompatibility } from '@dude/contracts/hub';
import type { HubEnrollmentRow } from '../store/repos/hub-enrollment.repo.js';
import { isTlsError } from './hub-client.js';
import { createPinnedTransport } from './pinned-transport.js';
import type { PinnedTarget } from './pinned-transport.js';

export type ProbeOutcome =
  | { kind: 'ok'; latencyMs: number; hubProtocol: number; hubVersion: string; compatibility: 'compatible' | 'client-too-old' | 'hub-too-old'; dateHeader: string | null }
  | { kind: 'tls'; message: string }
  | { kind: 'unreachable'; message: string };

export interface StateInput {
  enrollment: Pick<HubEnrollmentRow, 'state'> | null;
  hubState: AgentHubStatus['state'];
  probe: ProbeOutcome | null;
}

/** The device-facing states. Revocation and a changed Hub authority (both known locally) win over any probe result; a probe pin mismatch is `untrusted-certificate`. */
export function mapAgentState(input: StateInput): AgentDiagnosticsState {
  if (input.enrollment === null) return 'standalone';
  if (input.enrollment.state === 'revoked' || input.hubState === 'revoked') return 'revoked';
  if (input.hubState === 'authority-changed') return 'authority-changed';
  const probe = input.probe;
  if (probe === null) {
    if (input.hubState === 'untrusted-tls') return 'untrusted-certificate';
    if (input.hubState === 'incompatible') return 'incompatible';
    return input.hubState === 'online' ? 'enrolled' : 'unreachable';
  }
  if (probe.kind === 'tls') return 'untrusted-certificate';
  if (probe.kind === 'unreachable') return 'unreachable';
  return probe.compatibility === 'compatible' ? 'enrolled' : 'incompatible';
}

/** Hub clock minus device clock in whole seconds, from an HTTP `Date` header; null when absent or unparsable. */
export function clockSkewSeconds(dateHeader: string | null | undefined, deviceNowMs: number): number | null {
  if (!dateHeader) return null;
  const hub = Date.parse(dateHeader);
  return Number.isFinite(hub) ? Math.round((hub - deviceNowMs) / 1000) : null;
}

/** Drops the query, fragment and credentials of a URL: the report is copied into support requests. */
export function redactHubUrl(url: string): string | null {
  try {
    const u = new URL(url);
    return `${u.protocol}//${u.host}${u.pathname === '/' ? '' : u.pathname}`;
  } catch { return null; }
}

/** One public hello through the pinned transport, timed. Never throws. */
export async function probeHello(transport: HubTransport, clock: () => number): Promise<ProbeOutcome> {
  const started = clock();
  try {
    const res = await transport.request({ method: 'GET', path: '/api/v1/hello' });
    const latencyMs = Math.max(0, Math.round(clock() - started));
    if (res.status !== 200 || !Value.Check(HelloResponse, res.body)) return { kind: 'unreachable', message: `The Hub answered HTTP ${res.status} with an unexpected body.` };
    const hello = res.body;
    return {
      kind: 'ok', latencyMs, hubProtocol: hello.protocolVersion, hubVersion: hello.hubVersion,
      compatibility: checkProtocolCompatibility(hello, { protocolVersion: HUB_PROTOCOL_VERSION, minHubProtocol: HUB_MIN_CLIENT_PROTOCOL }),
      dateHeader: res.headers['date'] ?? null,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'The Hub could not be reached.';
    return isTlsError(error) ? { kind: 'tls', message } : { kind: 'unreachable', message };
  }
}

export interface AgentDiagnosticsDeps {
  enrollment: HubEnrollmentRow | null;
  status: AgentHubStatus;
  sync: AgentSyncStatus | null;
  now: () => Date;
  clock?: () => number;
  /** Test seam; defaults to the pinned node:https transport (the same one the connection manager uses). */
  createTransport?: (target: PinnedTarget) => HubTransport;
}

export async function buildAgentDiagnostics(deps: AgentDiagnosticsDeps): Promise<AgentDiagnostics> {
  const { enrollment, status, sync } = deps;
  const clock = deps.clock ?? (() => performance.now());
  let probe: ProbeOutcome | null = null;
  if (enrollment && enrollment.state === 'enrolled') {
    const url = new URL(enrollment.hubUrl);
    const target: PinnedTarget = {
      host: url.hostname, port: Number(url.port || 443),
      pins: [enrollment.spkiActive, ...(enrollment.spkiNext ? [enrollment.spkiNext] : []), ...enrollment.proxySpkis],
    };
    probe = await probeHello((deps.createTransport ?? ((t) => createPinnedTransport(t)))(target), clock);
  }
  const ok = probe?.kind === 'ok' ? probe : null;
  return {
    state: mapAgentState({ enrollment, hubState: status.state, probe }),
    hubUrl: enrollment ? redactHubUrl(enrollment.hubUrl) : null,
    pins: { active: enrollment?.spkiActive ?? null, next: enrollment?.spkiNext ?? null, proxy: enrollment ? [...enrollment.proxySpkis] : [] },
    lastContactAt: enrollment?.lastContactAt ?? status.lastContactAt,
    latencyMs: ok?.latencyMs ?? null,
    protocol: { clientProtocol: HUB_PROTOCOL_VERSION, hubProtocol: ok?.hubProtocol ?? null, compatibility: ok?.compatibility ?? null, hubVersion: ok?.hubVersion ?? status.hubVersion },
    clockSkewSeconds: ok ? clockSkewSeconds(ok.dateHeader, deps.now().getTime()) : null,
    sync: sync ? { cursor: sync.cursor, pending: sync.pending, conflicts: sync.conflicts, quarantined: sync.quarantined, paused: sync.phase === 'paused' } : null,
    probeError: probe && probe.kind !== 'ok' ? probe.message : null,
    checkedAt: deps.now().toISOString(),
  };
}
