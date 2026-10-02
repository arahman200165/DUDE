import { createDesktopHubAdmin } from './desktop-hub-admin.adapter';
import { HubAdminError } from './hub-admin.port';
import { fakeHub, FAKE_HUB_PAIRING_STRING } from '../platform/testing/fake-hub';
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
    expect(await admin.status()).toMatchObject({ enrollmentState: 'standalone' });
    await expect(admin.enroll(FAKE_HUB_PAIRING_STRING)).resolves.toMatchObject({ hubInstanceId: 'fake-hub' });
    expect(await admin.status()).toMatchObject({ enrollmentState: 'enrolled', hubUrl: 'https://hub.local:47600' });
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

  it('keeps the hub-web-only methods unavailable', async () => {
    const admin = createDesktopHubAdmin(() => fakeHub());
    await expect(admin.signIn('x')).rejects.toMatchObject({ code: 'unavailable' });
    await expect(admin.currentSession()).rejects.toMatchObject({ code: 'unavailable' });
  });
});
