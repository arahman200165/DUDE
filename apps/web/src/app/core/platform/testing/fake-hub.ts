import type { DesktopHubBridge, DesktopHubOwnerStatus, DesktopLocalHubInfo } from '@dude/contracts/shared/models/platform-bridge.model';
import type { DeviceInfo, HubDiagnosticsReport, ReachabilityEchoResponse, SessionInfo, SyncSummary } from '@dude/contracts/hub';
import type { AgentDiagnostics } from '@dude/contracts';

export const FAKE_HUB_DEVICE_ID = '0190aaaa-0000-7000-8000-000000000001';
export const FAKE_HUB_PAIRING_STRING = 'dude-pair:v1:hub.local:47600:ABCD2345:AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA';

/** A synced Hub with one caught-up device, for specs. */
export const FAKE_SYNC_SUMMARY = (deviceId: string): SyncSummary => ({
  floor: 2, headRevision: 42, retentionDays: 90,
  counts: { settings: 3, favorites: 1, pipelines: 0, projects: 2, workspaces: 0, home: 1, usage: 0, 'workspace-layout': 0, scratchpad: 0 },
  devices: [{ deviceId, kind: 'desktop' as const, paused: false, cursor: 42, lag: 0, lastPushAt: '2026-01-01T00:00:00.000Z', lastPullAt: '2026-01-01T00:05:00.000Z', quarantined: 0, conflicts: 0, pending: 0 }],
});

/** A reachability echo the Hub could return: from a private address (nothing proven) or from a public one on a configured name (verified). */
export const FAKE_REACHABILITY_PRIVATE: ReachabilityEchoResponse = {
  observed: { scope: 'private', viaProxy: false }, host: 'hub.local:47600', hostMatchesConfiguredName: true, verified: false,
  reason: 'This request came from a private address, so it does not show the Hub is reachable from the Internet.', at: '2026-10-04T00:00:00.000Z',
};
export const FAKE_REACHABILITY_VERIFIED: ReachabilityEchoResponse = {
  observed: { scope: 'public', viaProxy: false }, host: 'hub.example.com', hostMatchesConfiguredName: true, verified: true,
  reason: 'The Hub saw this request arrive from a public Internet address through hub.example.com, so it is reachable from outside.', at: '2026-10-04T00:00:00.000Z',
};

/** A private-mode Hub report with a local-CA certificate, one passing and one failing check, for specs. */
export const FAKE_HUB_DIAGNOSTICS: HubDiagnosticsReport = {
  generatedAt: '2026-10-01T10:00:00.000Z', hubVersion: '0.0.44', protocolVersion: 2, schemaVersion: 7,
  service: { mode: 'service', uptimeSeconds: 3600 },
  exposure: { mode: 'private', bind: 'lan', bindAddress: '0.0.0.0', port: 47600, names: ['hub.local', '192.168.1.20'], canonicalOrigin: 'https://hub.local:47600', proxy: null },
  certificate: {
    source: 'local-ca', subject: 'CN=hub.local', sans: ['hub.local'], missingNames: ['192.168.1.20'], notBefore: '2026-09-01T00:00:00.000Z', notAfter: '2026-12-01T00:00:00.000Z', daysLeft: 59,
    spkiSha256: 'A'.repeat(43), nextSpkiSha256: 'B'.repeat(43), pendingAcks: 1, chainLength: 2,
    ca: { fingerprintSha256: 'C'.repeat(43), notAfter: '2036-09-01T00:00:00.000Z', permitted: { dns: ['hub.local'], ip: ['192.168.1.0/24'] } },
    renewal: { automatic: true, nextCheckAt: null }, hsts: false,
  },
  proxyPins: { active: null, next: null },
  firewall: { applicable: true, ruleName: 'DUDE Hub', present: true, profile: 'private' },
  realtime: { available: true, connections: { owner: 1, device: 2 } },
  checks: [
    { id: 'tls-names', label: 'Certificate covers every name', status: 'fail', basis: 'verified', detail: '192.168.1.20 is not in the certificate.', fix: 'dude-hub tls reissue --name 192.168.1.20' },
    { id: 'firewall', label: 'Firewall rule present', status: 'pass', basis: 'verified', detail: 'Rule "DUDE Hub" is enabled.' },
    { id: 'external', label: 'Reachable from outside', status: 'info', basis: 'not-checked', detail: 'Not verified yet. Open the Hub from a device outside your network.' },
  ],
};

export const FAKE_AGENT_DIAGNOSTICS: AgentDiagnostics = {
  state: 'enrolled', hubUrl: 'https://hub.local:47600', pins: { active: 'A'.repeat(43), next: null, proxy: [] }, lastContactAt: '2026-10-01T10:00:00.000Z', latencyMs: 12,
  protocol: { clientProtocol: 2, hubProtocol: 2, compatibility: 'compatible', hubVersion: '0.0.44' }, clockSkewSeconds: 1,
  sync: { cursor: 42, pending: 0, conflicts: 0, quarantined: 0, paused: false }, probeError: null, checkedAt: '2026-10-01T10:00:01.000Z',
};

/** Where the local Hub starts: nothing installed, installed but not set up, set up, or set up with a newer Hub bundled in the app. */
export type FakeLocalHubScenario = 'not-installed' | 'installed-unbootstrapped' | 'bootstrapped' | 'update-available';

/**
 * In-memory Hub for specs: one owner (default password `correct horse battery`), a device list, sessions and a
 * one-shot confirm-token store, so preview/confirm flows can be driven end to end. `calls` records method names.
 */
export function fakeHub(options: { password?: string; localHub?: FakeLocalHubScenario } = {}): DesktopHubBridge & { readonly calls: string[] } {
  const password = options.password ?? 'correct horse battery';
  const calls: string[] = [];
  const scenario = options.localHub ?? 'bootstrapped';
  const local = {
    installed: scenario !== 'not-installed',
    bootstrapped: scenario === 'bootstrapped' || scenario === 'update-available',
    hubVersion: scenario === 'update-available' ? '0.0.1' : '0.0.44',
    bundled: scenario === 'update-available' ? '0.0.44' : scenario === 'not-installed' ? null : '0.0.44',
  };
  const localInfo = (): DesktopLocalHubInfo => ({
    installed: local.installed, installDir: local.installed ? 'C:\\Program Files\\DUDE Hub' : null,
    found: local.installed, bootstrapped: local.installed ? local.bootstrapped : null, hubVersion: local.installed ? local.hubVersion : null,
    bundledHubVersion: local.bundled, updateAvailable: local.installed && local.bundled !== null && local.bundled !== local.hubVersion,
  });
  let enrolled = false;
  let signedIn = false;
  const tokens = new Set<string>();
  let counter = 0;
  const issue = (action: string) => {
    const confirmToken = `fake-confirm-${++counter}`;
    tokens.add(confirmToken);
    return { confirmToken, expiresAt: '2099-01-01T00:00:00.000Z', summary: { action } };
  };
  const consume = (token: string): boolean => tokens.delete(token);
  const device = (id: string, displayName: string, extra: Partial<DeviceInfo> = {}): DeviceInfo => ({
    deviceId: id, kind: 'desktop', displayName, platform: 'windows', appVersion: '0.0.0', protocolVersion: 1, capabilities: [], registeredAt: '2026-01-01T00:00:00.000Z',
    lastSeenAt: null, revokedAt: null, unenrolledAt: null, recoveryTrusted: false, online: false, current: false, ...extra,
  });
  const devices = new Map<string, DeviceInfo>([[FAKE_HUB_DEVICE_ID, device(FAKE_HUB_DEVICE_ID, 'This PC', { current: true })]]);
  const sessions = new Map<string, SessionInfo>([
    ['aaaaaaaaaaaaaaaa', {
      sessionId: 'aaaaaaaaaaaaaaaa', kind: 'bearer', createdAt: '2026-01-01T00:00:00.000Z', lastActiveAt: '2026-01-01T00:00:00.000Z',
      idleExpiresAt: '2099-01-01T00:00:00.000Z', absoluteExpiresAt: '2099-01-01T00:00:00.000Z', current: true, userAgent: null, ip: null, deviceId: FAKE_HUB_DEVICE_ID,
    }],
  ]);
  const fail = (code: string, message: string) => ({ ok: false as const, error: { code, message } });
  const ok = <T>(result: T) => ({ ok: true as const, result });
  const needOwner = () => (signedIn ? null : fail('unauthorized', 'Sign in as the owner first.'));
  const owner = (): DesktopHubOwnerStatus => ({ signedIn, ownerDisplayName: signedIn ? 'Owner' : null, expiresAt: signedIn ? '2099-01-01T00:00:00.000Z' : null });
  const track = <A extends unknown[], R>(name: string, fn: (...args: A) => R) => (...args: A): R => {
    calls.push(name);
    return fn(...args);
  };
  const badConfirm = () => fail('forbidden', 'The confirmation is missing, expired or already used.');

  return {
    calls,
    onStatusChanged: () => () => undefined,
    status: track('status', async () =>
      ok({
        enrollmentState: enrolled ? ('enrolled' as const) : ('standalone' as const),
        hubUrl: enrolled ? 'https://hub.local:47600' : null,
        environmentId: enrolled ? 'fake-environment' : null,
        hubInstanceId: enrolled ? 'fake-hub' : null,
        hubVersion: enrolled ? local.hubVersion : null,
        recoveryTrusted: enrolled ? false : null,
        reachable: enrolled ? true : null,
      })),
    probeLocal: track('probeLocal', async (port?: number) =>
      local.installed
        ? ok({ found: true, port: port ?? 47600, hubInstanceId: 'fake-hub', hubVersion: local.hubVersion, bootstrapped: local.bootstrapped })
        : ok({ found: false, port: null, hubInstanceId: null, hubVersion: null, bootstrapped: null })),
    enroll: track('enroll', async (pairingString: string) => {
      if (pairingString !== FAKE_HUB_PAIRING_STRING) return fail('bad-request', 'That pairing string is not valid.');
      enrolled = true;
      return ok({ deviceId: FAKE_HUB_DEVICE_ID, environmentId: 'fake-environment', hubInstanceId: 'fake-hub', hubUrl: 'https://hub.local:47600' });
    }),
    unenroll: track('unenroll', async () => {
      enrolled = false;
      signedIn = false;
      return ok({ unenrolled: true, hubNotified: true });
    }),
    ownerStatus: track('ownerStatus', async () => ok(owner())),
    ownerSignIn: track('ownerSignIn', async (candidate: string) => {
      if (candidate !== password) return fail('unauthorized', 'The password is incorrect.');
      signedIn = true;
      return ok(owner());
    }),
    ownerSignOut: track('ownerSignOut', async () => {
      signedIn = false;
      return ok({ ok: true as const });
    }),
    listDevices: track('listDevices', async () => needOwner() ?? ok([...devices.values()])),
    syncSummary: track('syncSummary', async () =>
      needOwner() ?? ok(FAKE_SYNC_SUMMARY(FAKE_HUB_DEVICE_ID))),
    diagnostics: track('diagnostics', async () => needOwner() ?? ok(FAKE_HUB_DIAGNOSTICS)),
    reachabilityEcho: track('reachabilityEcho', async (_publicUrl: string) => ok({ ...FAKE_REACHABILITY_VERIFIED, rttMs: 42 })),
    agentDiagnostics: track('agentDiagnostics', async () => ok(FAKE_AGENT_DIAGNOSTICS)),
    createPairingCode: track('createPairingCode', async () =>
      needOwner() ?? ok({ pairingCode: 'ABCD-2345', pairingString: FAKE_HUB_PAIRING_STRING, expiresAt: '2099-01-01T00:00:00.000Z', hubUrl: 'https://hub.local:47600', spkiSha256: 'A'.repeat(43) })),
    renameDevice: track('renameDevice', async (id: string, name: string) => {
      const denied = needOwner();
      if (denied) return denied;
      const found = devices.get(id);
      if (!found) return fail('not-found', 'No such device.');
      const renamed = { ...found, displayName: name };
      devices.set(id, renamed);
      return ok(renamed);
    }),
    revokeDevicePreview: track('revokeDevicePreview', async (id: string) => needOwner() ?? (devices.has(id) ? ok(issue(`revoke-device:${id}`)) : fail('not-found', 'No such device.'))),
    revokeDevice: track('revokeDevice', async (id: string, token: string) => {
      if (!consume(token)) return badConfirm();
      devices.delete(id);
      return ok({ ok: true as const });
    }),
    setRecoveryTrust: track('setRecoveryTrust', async (id: string, candidate: string, trusted: boolean) => {
      if (candidate !== password) return fail('unauthorized', 'The password is incorrect.');
      const found = devices.get(id);
      if (!found) return fail('not-found', 'No such device.');
      const updated = { ...found, recoveryTrusted: trusted };
      devices.set(id, updated);
      return ok(updated);
    }),
    listSessions: track('listSessions', async () => needOwner() ?? ok([...sessions.values()])),
    revokeSession: track('revokeSession', async (id: string) => (sessions.delete(id) ? ok({ ok: true as const }) : fail('not-found', 'No such session.'))),
    revokeAllPreview: track('revokeAllPreview', async () => needOwner() ?? ok(issue('revoke-all-sessions'))),
    revokeAll: track('revokeAll', async (token: string) => {
      if (!consume(token)) return badConfirm();
      sessions.clear();
      return ok({ ok: true as const });
    }),
    listAudit: track('listAudit', async () => needOwner() ?? ok({ events: [], nextBeforeSeq: null })),
    listSecurityAlerts: track('listSecurityAlerts', async () => needOwner() ?? ok({ alerts: [], unseen: 0, seenSeq: 0 })),
    markSecurityAlertsSeen: track('markSecurityAlertsSeen', async (_upToSeq: number) => needOwner() ?? ok({ ok: true as const })),
    recoveryCodesPreview: track('recoveryCodesPreview', async () => needOwner() ?? ok(issue('regenerate-recovery-codes'))),
    regenerateRecoveryCodes: track('regenerateRecoveryCodes', async (token: string) => {
      if (!consume(token)) return badConfirm();
      return ok({ recoveryCodes: Array.from({ length: 10 }, (_, i) => `ABCDE-0000${i}`) });
    }),
    localHubInfo: track('localHubInfo', async () => ok(localInfo())),
    setupLocalHub: track('setupLocalHub', async (request) => {
      if (!local.installed) return fail('not-installed', 'The DUDE Hub is not installed on this PC.');
      if (local.bootstrapped) return fail('already-bootstrapped', 'This Hub already has an owner.');
      if (request.password.length < 12) return fail('bad-request', 'Invalid request.');
      local.bootstrapped = true;
      enrolled = true;
      signedIn = true;
      return ok({
        recoveryCodes: Array.from({ length: 10 }, (_, i) => `ABCDE-0000${i}`),
        status: {
          enrollmentState: 'enrolled' as const, hubUrl: 'https://127.0.0.1:47600', environmentId: 'fake-environment', hubInstanceId: 'fake-hub',
          hubVersion: local.hubVersion, recoveryTrusted: false, reachable: true, connection: 'online' as const,
        },
      });
    }),
    updateLocalHub: track('updateLocalHub', async () => {
      const info = localInfo();
      if (!info.updateAvailable) return fail('no-update', 'There is no Hub update to install.');
      const fromVersion = local.hubVersion;
      local.hubVersion = local.bundled!;
      return ok({ fromVersion, toVersion: local.hubVersion });
    }),
    openWeb: track('openWeb', async () => ok({ ok: true as const })),
    rootCertificatePreview: track('rootCertificatePreview', async () => ok({ available: false as const, reason: 'not-local-ca' as const })),
    installRootCertificate: track('installRootCertificate', async () => ok({ installed: true as const })),
    recoverOwner: track('recoverOwner', async (next: string) => {
      if (next.length < 12) return fail('bad-request', 'The new password is too short.');
      return ok({ ok: true as const });
    }),
    changePassword: track('changePassword', async (current: string, next: string) => {
      if (current !== password) return fail('forbidden', 'The current password is incorrect.');
      if (next.length < 12) return fail('bad-request', 'The new password is too short.');
      return ok({ ok: true as const });
    }),
  };
}
