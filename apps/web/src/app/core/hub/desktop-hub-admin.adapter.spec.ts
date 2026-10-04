import { createDesktopHubAdmin } from './desktop-hub-admin.adapter';
import { HubAdminError } from './hub-admin.port';
import { fakeHub, FAKE_HUB_PAIRING_STRING, type FakeLocalHubScenario } from '../platform/testing/fake-hub';
import { fakeElectronBridge } from '../platform/testing/fake-electron-bridge';

describe('desktop Hub admin adapter', () => {
  it('rejects every call as unavailable when the bridge has no hub namespace', async () => {
    const admin = createDesktopHubAdmin(() => fakeElectronBridge({ hub: undefined }).hub);
    await expect(admin.status()).rejects.toMatchObject({ name: 'HubAdminError', code: 'unavailable' });
    await expect(admin.listDevices()).rejects.toBeInstanceOf(HubAdminError);
  });

  it('passes results through and normalizes error results', async () => {
    const hub = fakeHub();
    const admin = createDesktopHubAdmin(() => hub);
    await expect(admin.listDevices()).rejects.toMatchObject({ code: 'unauthorized' });
    await expect(admin.ownerSignIn('wrong')).rejects.toMatchObject({ code: 'unauthorized', message: 'The password is incorrect.' });
    await expect(admin.ownerSignIn('correct horse battery')).resolves.toMatchObject({ signedIn: true });
    expect(await admin.listDevices()).toHaveLength(1);
    expect(await admin.syncSummary()).toMatchObject({ headRevision: 42, retentionDays: 90 });
    expect(await admin.status()).toMatchObject({ enrollmentState: 'standalone' });
    await expect(admin.enroll(FAKE_HUB_PAIRING_STRING)).resolves.toMatchObject({ hubInstanceId: 'fake-hub' });
    expect(await admin.status()).toMatchObject({ enrollmentState: 'enrolled', hubUrl: 'https://hub.local:47600' });
  });

  it('passes the reconnect request (with its acknowledgement) through and normalizes failures', async () => {
    const hub = fakeHub();
    const seen: unknown[] = [];
    const admin = createDesktopHubAdmin(() => ({ ...hub, reconnect: (request: { pairingString: string; acknowledged: true }) => { seen.push(request); return hub.reconnect(request); } }));
    await expect(admin.reconnect({ pairingString: FAKE_HUB_PAIRING_STRING, acknowledged: true })).rejects.toMatchObject({ code: 'not-enrolled' });
    await admin.enroll(FAKE_HUB_PAIRING_STRING);
    await expect(admin.reconnect({ pairingString: FAKE_HUB_PAIRING_STRING, acknowledged: true })).resolves.toMatchObject({ hubInstanceId: 'fake-hub' });
    expect(seen).toEqual([{ pairingString: FAKE_HUB_PAIRING_STRING, acknowledged: true }, { pairingString: FAKE_HUB_PAIRING_STRING, acknowledged: true }]);
  });

  it('passes the Hub and device diagnostics through; the Hub report needs the owner', async () => {
    const hub = fakeHub();
    const admin = createDesktopHubAdmin(() => hub);
    await expect(admin.diagnostics()).rejects.toMatchObject({ code: 'unauthorized' });
    await expect(admin.agentDiagnostics?.()).resolves.toMatchObject({ state: 'enrolled' });
    await admin.ownerSignIn('correct horse battery');
    await expect(admin.diagnostics()).resolves.toMatchObject({ exposure: { mode: 'private' } });
  });

  it('passes security alerts through the owner bridge', async () => {
    const hub = fakeHub();
    const admin = createDesktopHubAdmin(() => hub);
    await expect(admin.listSecurityAlerts()).rejects.toMatchObject({ code: 'unauthorized' });
    await admin.ownerSignIn('correct horse battery');
    await expect(admin.listSecurityAlerts()).resolves.toEqual({ alerts: [], unseen: 0, seenSeq: 0 });
    await expect(admin.markSecurityAlertsSeen(3)).resolves.toEqual({ ok: true });
  });

  it('passes the public address to the device-side reachability test and normalizes failures', async () => {
    const hub = fakeHub();
    const seen: string[] = [];
    const spied = { ...hub, reachabilityEcho: (url: string) => { seen.push(url); return hub.reachabilityEcho(url); } };
    const admin = createDesktopHubAdmin(() => spied);
    await expect(admin.reachabilityEcho?.('https://hub.example.com')).resolves.toMatchObject({ verified: true, rttMs: 42 });
    expect(seen).toEqual(['https://hub.example.com']);
    const failing = { ...hub, reachabilityEcho: async () => ({ ok: false as const, error: { code: 'untrusted-tls', message: 'Not trusted.' } }) };
    await expect(createDesktopHubAdmin(() => failing).reachabilityEcho?.('https://x.example.com')).rejects.toMatchObject({ code: 'untrusted-tls' });
  });

  it('carries retryAfterMs from a locked result', async () => {
    const hub = { ...fakeHub(), ownerSignIn: async () => ({ ok: false as const, error: { code: 'locked', message: 'Too many attempts.', retryAfterMs: 30_000 } }) };
    const admin = createDesktopHubAdmin(() => hub);
    await expect(admin.ownerSignIn('x')).rejects.toMatchObject({ code: 'locked', retryAfterMs: 30_000 });
  });

  it('turns a thrown IPC failure into a HubAdminError', async () => {
    const hub = {
      ...fakeHub(),
      status: async () => {
        throw new Error('ipc closed');
      },
    };
    await expect(createDesktopHubAdmin(() => hub).status()).rejects.toMatchObject({ code: 'internal', message: 'ipc closed' });
  });

  it('drives the two-step revoke through the confirm token and rejects a replayed one', async () => {
    const hub = fakeHub();
    const admin = createDesktopHubAdmin(() => hub);
    await admin.ownerSignIn('correct horse battery');
    const [device] = await admin.listDevices();
    const preview = await admin.revokeDevicePreview(device.deviceId);
    await expect(admin.revokeDevice(device.deviceId, preview.confirmToken)).resolves.toEqual({ ok: true });
    await expect(admin.revokeDevice(device.deviceId, preview.confirmToken)).rejects.toMatchObject({ code: 'forbidden' });
  });

  const adminFor = (localHub: FakeLocalHubScenario) => {
    const hub = fakeHub({ localHub });
    return createDesktopHubAdmin(() => hub);
  };

  it('drives the local Hub scenarios through the optional desktop methods', async () => {
    const none = adminFor('not-installed');
    await expect(none.localHubInfo!()).resolves.toMatchObject({ installed: false, installDir: null });
    await expect(none.setupLocalHub!({ environmentName: 'Home', ownerDisplayName: 'Me', password: 'a long password' })).rejects.toMatchObject({ code: 'not-installed' });

    const fresh = adminFor('installed-unbootstrapped');
    await expect(fresh.localHubInfo!()).resolves.toMatchObject({ installed: true, bootstrapped: false, updateAvailable: false });
    const set = await fresh.setupLocalHub!({ environmentName: 'Home', ownerDisplayName: 'Me', password: 'a long password' });
    expect(set.recoveryCodes).toHaveLength(10);
    await expect(fresh.localHubInfo!()).resolves.toMatchObject({ bootstrapped: true });
    await expect(fresh.ownerStatus()).resolves.toMatchObject({ signedIn: true });
    await expect(fresh.setupLocalHub!({ environmentName: 'Home', ownerDisplayName: 'Me', password: 'a long password' })).rejects.toMatchObject({ code: 'already-bootstrapped' });

    const old = adminFor('update-available');
    await expect(old.localHubInfo!()).resolves.toMatchObject({ updateAvailable: true, hubVersion: '0.0.1', bundledHubVersion: '0.0.44' });
    await expect(old.updateLocalHub!()).resolves.toEqual({ fromVersion: '0.0.1', toVersion: '0.0.44' });
    await expect(old.localHubInfo!()).resolves.toMatchObject({ updateAvailable: false });
    await expect(old.updateLocalHub!()).rejects.toMatchObject({ code: 'no-update' });
  });

  it('keeps the hub-web-only methods unavailable', async () => {
    const hub = fakeHub();
    const admin = createDesktopHubAdmin(() => hub);
    await expect(admin.signIn('x')).rejects.toMatchObject({ code: 'unavailable' });
    await expect(admin.currentSession()).rejects.toMatchObject({ code: 'unavailable' });
  });
});
