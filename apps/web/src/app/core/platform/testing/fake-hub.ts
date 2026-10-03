import type { DesktopHubBridge, DesktopHubOwnerStatus, DesktopLocalHubInfo } from '@dude/contracts/shared/models/platform-bridge.model';
import type { DeviceInfo, SessionInfo, SyncSummary } from '@dude/contracts/hub';

export const FAKE_HUB_DEVICE_ID = '0190aaaa-0000-7000-8000-000000000001';
export const FAKE_HUB_PAIRING_STRING = 'dude-pair:v1:hub.local:47600:ABCD2345:AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA';

/** A synced Hub with one caught-up device, for specs. */
export const FAKE_SYNC_SUMMARY = (deviceId: string): SyncSummary => ({
  floor: 2, headRevision: 42, retentionDays: 90,
  counts: { settings: 3, favorites: 1, pipelines: 0, projects: 2, workspaces: 0, home: 1, usage: 0, 'workspace-layout': 0, scratchpad: 0 },
  devices: [{ deviceId, cursor: 42, lag: 0, lastPushAt: '2026-01-01T00:00:00.000Z', lastPullAt: '2026-01-01T00:05:00.000Z', quarantined: 0, conflicts: 0, pending: 0 }],
});

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
    deviceId: id, displayName, platform: 'windows', appVersion: '0.0.0', protocolVersion: 1, capabilities: [], registeredAt: '2026-01-01T00:00:00.000Z',
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
