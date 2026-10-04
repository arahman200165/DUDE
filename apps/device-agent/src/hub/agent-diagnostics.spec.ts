import { describe, expect, it } from 'vitest';
import type { HubTransport } from '@dude/api-client';
import type { AgentHubStatus, AgentSyncStatus } from '@dude/contracts';
import type { HubEnrollmentRow } from '../store/repos/hub-enrollment.repo.js';
import { buildAgentDiagnostics, clockSkewSeconds, mapAgentState, probeHello, redactHubUrl } from './agent-diagnostics.js';
import type { ProbeOutcome } from './agent-diagnostics.js';
import { PIN_MISMATCH_CODE } from './pinned-transport.js';

const SPKI = 'A'.repeat(43);
const NEXT = 'B'.repeat(43);
const HELLO = {
  service: 'dude-hub', protocolVersion: 2, minClientProtocol: 1, hubVersion: '0.9.0', hubInstanceId: '0190aaaa-0000-7000-8000-000000000001', environmentId: 'env', bootstrapped: true,
  tls: { spkiSha256: SPKI, nextSpkiSha256: null },
};
const ok = (over: Partial<Extract<ProbeOutcome, { kind: 'ok' }>> = {}): ProbeOutcome => ({ kind: 'ok', latencyMs: 12, hubProtocol: 2, hubVersion: '0.9.0', compatibility: 'compatible', dateHeader: null, ...over });
const enrolled = { state: 'enrolled' as const };

describe('mapAgentState', () => {
  it('maps every state', () => {
    expect(mapAgentState({ enrollment: null, hubState: 'standalone', probe: null })).toBe('standalone');
    expect(mapAgentState({ enrollment: enrolled, hubState: 'online', probe: ok() })).toBe('enrolled');
    expect(mapAgentState({ enrollment: enrolled, hubState: 'offline', probe: { kind: 'unreachable', message: 'x' } })).toBe('unreachable');
    expect(mapAgentState({ enrollment: enrolled, hubState: 'online', probe: { kind: 'tls', message: 'x' } })).toBe('untrusted-certificate');
    expect(mapAgentState({ enrollment: enrolled, hubState: 'online', probe: ok({ compatibility: 'client-too-old' }) })).toBe('incompatible');
    expect(mapAgentState({ enrollment: { state: 'revoked' }, hubState: 'revoked', probe: null })).toBe('revoked');
  });
  it('lets local revocation win over a successful probe', () => {
    expect(mapAgentState({ enrollment: enrolled, hubState: 'revoked', probe: ok() })).toBe('revoked');
  });
  it('falls back to the manager state when no probe ran', () => {
    expect(mapAgentState({ enrollment: enrolled, hubState: 'untrusted-tls', probe: null })).toBe('untrusted-certificate');
    expect(mapAgentState({ enrollment: enrolled, hubState: 'incompatible', probe: null })).toBe('incompatible');
    expect(mapAgentState({ enrollment: enrolled, hubState: 'connecting', probe: null })).toBe('unreachable');
  });
});

describe('helpers', () => {
  it('computes skew from the Date header', () => {
    const now = Date.parse('2026-01-01T00:00:00Z');
    expect(clockSkewSeconds('Thu, 01 Jan 2026 00:02:00 GMT', now)).toBe(120);
    expect(clockSkewSeconds('Wed, 31 Dec 2025 23:59:30 GMT', now)).toBe(-30);
    expect(clockSkewSeconds('nonsense', now)).toBeNull();
    expect(clockSkewSeconds(null, now)).toBeNull();
  });
  it('strips query, fragment and credentials from the Hub URL', () => {
    expect(redactHubUrl('https://u:p@hub.local:47600/?token=abc#x')).toBe('https://hub.local:47600');
    expect(redactHubUrl('not a url')).toBeNull();
  });
});

describe('probeHello', () => {
  const transport = (fn: () => Promise<{ status: number; headers: Record<string, string>; body: unknown }>): HubTransport => ({ request: fn });
  it('times a good hello and reads the Date header and compatibility', async () => {
    let t = 100;
    const outcome = await probeHello(transport(async () => { t += 42; return { status: 200, headers: { date: 'Thu, 01 Jan 2026 00:00:00 GMT' }, body: HELLO }; }), () => t);
    expect(outcome).toMatchObject({ kind: 'ok', latencyMs: 42, hubProtocol: 2, compatibility: 'compatible', dateHeader: 'Thu, 01 Jan 2026 00:00:00 GMT' });
  });
  it('flags a client that is too old', async () => {
    const outcome = await probeHello(transport(async () => ({ status: 200, headers: {}, body: { ...HELLO, minClientProtocol: 99 } })), () => 0);
    expect(outcome).toMatchObject({ kind: 'ok', compatibility: 'client-too-old' });
  });
  it('maps a pin mismatch to tls and other failures to unreachable', async () => {
    const tls = await probeHello(transport(async () => { throw Object.assign(new Error('pin'), { code: PIN_MISMATCH_CODE }); }), () => 0);
    expect(tls.kind).toBe('tls');
    const down = await probeHello(transport(async () => { throw Object.assign(new Error('refused'), { code: 'ECONNREFUSED' }); }), () => 0);
    expect(down.kind).toBe('unreachable');
    const odd = await probeHello(transport(async () => ({ status: 200, headers: {}, body: { nope: 1 } })), () => 0);
    expect(odd.kind).toBe('unreachable');
  });
});

describe('buildAgentDiagnostics', () => {
  const status = (state: AgentHubStatus['state']): AgentHubStatus => ({ state, lastError: null, lastContactAt: null, ownerSignedIn: false, enrollment: null, hubVersion: '0.9.0', recoveryTrusted: null, pendingOps: 0, authority: null });
  const row = { state: 'enrolled', hubUrl: 'https://hub.local:47600/?x=1', spkiActive: SPKI, spkiNext: NEXT, proxySpkis: ['C'.repeat(43)], lastContactAt: '2026-01-01T00:00:00.000Z' } as unknown as HubEnrollmentRow;
  const sync = { phase: 'paused', cursor: 7, pending: 2, conflicts: 1, quarantined: 3 } as unknown as AgentSyncStatus;
  const now = () => new Date('2026-01-01T00:00:10.000Z');

  it('is standalone without any network call', async () => {
    const report = await buildAgentDiagnostics({ enrollment: null, status: status('standalone'), sync: null, now, createTransport: () => { throw new Error('no network'); } });
    expect(report).toMatchObject({ state: 'standalone', hubUrl: null, latencyMs: null, sync: null, pins: { active: null, next: null, proxy: [] } });
  });
  it('probes with every pin and reports counts, skew and a redacted URL', async () => {
    let pins: readonly string[] = [];
    const report = await buildAgentDiagnostics({
      enrollment: row, status: status('online'), sync, now, clock: () => 0,
      createTransport: (target) => { pins = target.pins; return { request: async () => ({ status: 200, headers: { date: 'Thu, 01 Jan 2026 00:01:10 GMT' }, body: HELLO }) }; },
    });
    expect(pins).toEqual([SPKI, NEXT, 'C'.repeat(43)]);
    expect(report).toMatchObject({
      state: 'enrolled', hubUrl: 'https://hub.local:47600', clockSkewSeconds: 60, latencyMs: 0,
      sync: { cursor: 7, pending: 2, conflicts: 1, quarantined: 3, paused: true }, pins: { active: SPKI, next: NEXT, proxy: ['C'.repeat(43)] },
      protocol: { hubProtocol: 2, compatibility: 'compatible' },
    });
  });
  it('reports an untrusted certificate on a pin mismatch', async () => {
    const report = await buildAgentDiagnostics({
      enrollment: row, status: status('online'), sync: null, now,
      createTransport: () => ({ request: async () => { throw Object.assign(new Error('mismatch'), { code: PIN_MISMATCH_CODE }); } }),
    });
    expect(report).toMatchObject({ state: 'untrusted-certificate', latencyMs: null, clockSkewSeconds: null, probeError: 'mismatch' });
  });
});
