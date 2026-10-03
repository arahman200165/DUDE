import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap } from '@angular/router';
import { HubAdminError, type HubAdminPort } from '../../../core/hub/hub-admin.port';
import { DevicesSettings } from './devices-settings';
import { buttonWithText, configureHubTest, createTestPort, device, settle, typeInto } from './hub/testing/hub-test-port';

const PASSWORD = 'correct horse battery';
const LIST = [
  device('0190aaaa-0000-7000-8000-000000000001', 'This PC', { current: true, lastSeenAt: new Date(Date.now() - 2 * 3_600_000).toISOString(), online: true, recoveryTrusted: true }),
  device('0190aaaa-0000-7000-8000-000000000002', 'Phone browser', { platform: 'web', lastSeenAt: null }),
  device('0190aaaa-0000-7000-8000-000000000003', 'Old laptop', { revokedAt: '2026-02-01T00:00:00.000Z' }),
  device('0190aaaa-0000-7000-8000-000000000004', 'Gone laptop', { unenrolledAt: '2026-02-01T00:00:00.000Z' }),
  device('0190aaaa-0000-7000-8000-000000000005', 'Work PC'),
];
const text = (el: HTMLElement, id: string): string => el.querySelector(`[data-testid="${id}"]`)?.textContent?.trim() ?? '';

async function mount(overrides: Partial<HubAdminPort> = {}, host: 'desktop' | 'hub-web' = 'desktop', signedIn = true) {
  const test = createTestPort({ listDevices: async () => LIST, ...overrides });
  configureHubTest(test.port, host);
  const fixture = TestBed.createComponent(DevicesSettings);
  fixture.detectChanges();
  await settle(fixture);
  const el = fixture.nativeElement as HTMLElement;
  if (signedIn && el.querySelector('[data-testid="owner-gate"]')) {
    typeInto(el.querySelector('#owner-gate-password') as HTMLInputElement, PASSWORD);
    await settle(fixture);
    buttonWithText(el, 'Sign in').click();
    await settle(fixture);
  }
  return { ...test, fixture, el };
}
const row = (el: HTMLElement, index: number): HTMLElement => el.querySelectorAll('[data-testid="device-table"] tbody tr')[index] as HTMLElement;

describe('DevicesSettings', () => {
  it('is behind the owner gate and loads nothing until signed in', async () => {
    const { el, port } = await mount({}, 'desktop', false);
    expect(el.querySelector('[data-testid="owner-gate"]')).not.toBeNull();
    expect(el.querySelector('[data-testid="devices"]')).toBeNull();
    expect(port.listDevices).not.toHaveBeenCalled();
  });

  it('shows a wrong-password error with the gate still up', async () => {
    const { fixture, el } = await mount({}, 'desktop', false);
    typeInto(el.querySelector('#owner-gate-password') as HTMLInputElement, 'nope');
    await settle(fixture);
    buttonWithText(el, 'Sign in').click();
    await settle(fixture);
    expect(text(el, 'owner-error')).toContain('incorrect');
    expect(el.querySelector('[data-testid="devices"]')).toBeNull();
  });

  it('tells a locked owner when to retry', async () => {
    const { fixture, el } = await mount(
      { ownerSignIn: async () => { throw new HubAdminError('locked', 'Too many attempts.', 30_000); } },
      'desktop',
      false,
    );
    typeInto(el.querySelector('#owner-gate-password') as HTMLInputElement, 'x');
    await settle(fixture);
    buttonWithText(el, 'Sign in').click();
    await settle(fixture);
    expect(text(el, 'owner-error')).toContain('Try again in 30 seconds');
  });

  it('renders the dense table with tags, status text and relative last-seen', async () => {
    const { el } = await mount();
    expect(el.querySelectorAll('[data-testid="device-table"] tbody tr').length).toBe(5);
    expect(row(el, 0).textContent).toContain('This device');
    expect(row(el, 0).textContent).toContain('Online');
    expect(row(el, 0).textContent).toContain('2 h ago');
    expect(row(el, 0).textContent).toContain('Recovery-trusted');
    expect(row(el, 1).textContent).toContain('Offline');
    expect(row(el, 1).textContent).toContain('Never');
    expect(row(el, 2).textContent).toContain('Revoked');
    expect(row(el, 3).textContent).toContain('Unenrolled');
  });

  it('does not offer recovery trust for web or revoked devices, nor revoke for an already revoked one', async () => {
    const { el } = await mount();
    expect(row(el, 0).textContent).toContain('Remove recovery trust');
    expect(row(el, 1).textContent).not.toContain('recovery');
    expect(row(el, 2).textContent).not.toContain('recovery');
    expect(row(el, 2).textContent).not.toContain('Revoke…');
    expect(row(el, 1).textContent).toContain('Revoke…');
  });

  it('falls back to the gate when the owner session expires mid-session', async () => {
    let calls = 0;
    const { fixture, el } = await mount({
      listDevices: async () => {
        if (++calls > 1) throw new HubAdminError('owner-session-expired', 'expired');
        return LIST;
      },
    });
    buttonWithText(el, 'Refresh').click();
    await settle(fixture);
    expect(el.querySelector('[data-testid="owner-gate"]')).not.toBeNull();
    expect(text(el, 'owner-error')).toContain('expired');
    expect(el.querySelector('[data-testid="devices"]')).toBeNull();
  });

  it('on the Hub web build the cookie session is already signed in, so no gate shows', async () => {
    const { el } = await mount({ ownerStatus: async () => ({ signedIn: true, ownerDisplayName: 'Alex', expiresAt: null }) }, 'hub-web');
    expect(el.querySelector('[data-testid="owner-gate"]')).toBeNull();
    expect(el.querySelector('[data-testid="device-table"]')).not.toBeNull();
  });

  it('refreshes the list when a status event arrives', async () => {
    const { fixture, port, emit } = await mount();
    const before = port.listDevices.mock.calls.length;
    emit({ enrollmentState: 'enrolled', hubUrl: null, environmentId: null, hubInstanceId: null, hubVersion: null, reachable: true });
    await settle(fixture);
    expect(port.listDevices.mock.calls.length).toBe(before + 1);
  });

  it('shows the Pair this desktop hint only when the setup page asked for it', async () => {
    const without = await mount();
    expect(without.el.querySelector('[data-testid="pair-desktop-hint"]')).toBeNull();
    TestBed.resetTestingModule();
    const test = createTestPort({ listDevices: async () => LIST, ownerStatus: async () => ({ signedIn: true, ownerDisplayName: 'Alex', expiresAt: null }) });
    configureHubTest(test.port, 'hub-web');
    TestBed.configureTestingModule({ providers: [{ provide: ActivatedRoute, useValue: { snapshot: { queryParamMap: convertToParamMap({ hint: 'pair-desktop' }) } } }] });
    const fixture = TestBed.createComponent(DevicesSettings);
    fixture.detectChanges();
    await settle(fixture);
    const hint = (fixture.nativeElement as HTMLElement).querySelector('[data-testid="pair-desktop-hint"]');
    expect(hint?.textContent).toContain('Settings � Environment & Hub � Connect to a Hub');
    expect(hint?.textContent).toContain('paste the pairing string');
  });

  describe('sync stats', () => {
    const stat = (deviceId: string, extra: Record<string, unknown> = {}) => ({ deviceId, cursor: 5, lag: 0, lastPushAt: null, lastPullAt: null, quarantined: 0, conflicts: 0, pending: 0, ...extra });
    const summary = (devices: ReturnType<typeof stat>[]) => ({
      floor: 0, headRevision: 5, retentionDays: 90, devices,
      counts: { settings: 0, favorites: 0, pipelines: 0, projects: 0, workspaces: 0, home: 0, usage: 0, 'workspace-layout': 0, scratchpad: 0 },
    });

    it('shows last sync, lag and attention badges, and never synced for devices without state', async () => {
      const recent = new Date(Date.now() - 10 * 60_000).toISOString();
      const older = new Date(Date.now() - 3 * 3_600_000).toISOString();
      const { el } = await mount({
        syncSummary: async () => summary([
          stat(LIST[0].deviceId, { lastPushAt: older, lastPullAt: recent, lag: 4, quarantined: 2, conflicts: 1, pending: 3 }),
          stat(LIST[4].deviceId),
        ]),
      });
      const mine = el.querySelector(`[data-testid="device-sync-${LIST[0].deviceId}"]`) as HTMLElement;
      expect(mine.querySelector('[data-testid="sync-last"]')?.textContent).toContain('10 min ago');
      expect(mine.querySelector('[data-testid="sync-lag"]')?.textContent).toContain('4 behind');
      expect(mine.querySelector('[data-testid="sync-quarantined"]')?.textContent).toContain('2 quarantined');
      expect(mine.querySelector('[data-testid="sync-conflicts"]')?.textContent).toContain('1 conflicts');
      expect(mine.querySelector('[data-testid="sync-pending"]')?.textContent).toContain('3 pending');
      const never = (id: string) => el.querySelector(`[data-testid="device-sync-${id}"] [data-testid="sync-never"]`);
      expect(never(LIST[1].deviceId)?.textContent).toContain('Never synced');
      expect(never(LIST[4].deviceId)).not.toBeNull();
    });

    it('shows up to date with no badges when the device is caught up', async () => {
      const { el } = await mount({ syncSummary: async () => summary([stat(LIST[0].deviceId, { lastPullAt: new Date().toISOString() })]) });
      const cell = el.querySelector(`[data-testid="device-sync-${LIST[0].deviceId}"]`) as HTMLElement;
      expect(cell.querySelector('[data-testid="sync-lag"]')?.textContent).toContain('up to date');
      expect(cell.querySelector('[data-testid="sync-quarantined"]')).toBeNull();
      expect(cell.querySelector('[data-testid="sync-pending"]')).toBeNull();
    });

    it('reports a summary failure inline and keeps the device list', async () => {
      const { el } = await mount({ syncSummary: async () => { throw new HubAdminError('not-found', 'No such route.'); } });
      expect(text(el, 'sync-error')).toContain('No such route');
      expect(el.querySelectorAll('[data-testid="device-table"] tbody tr')).toHaveLength(LIST.length);
      expect(el.querySelector(`[data-testid="device-sync-${LIST[0].deviceId}"] [data-testid="sync-unknown"]`)).not.toBeNull();
    });
  });

  describe('pairing', () => {
    it('shows the string, the separate code, the countdown and a QR frame', async () => {
      const { fixture, el, port } = await mount();
      buttonWithText(el, 'Pair a device').click();
      await settle(fixture);
      expect(port.createPairingCode).toHaveBeenCalledOnce();
      expect(text(el, 'pairing-string')).toContain('dude-pair:v1:');
      expect(text(el, 'pairing-code')).toBe('ABCD-2345');
      expect(text(el, 'pairing-countdown')).toMatch(/Expires in \d+:\d\d/);
      expect(text(el, 'pairing-panel')).toContain('Settings › Environment & Hub › Connect to a Hub');
    });

    it('once expired hides the secrets and offers a new code', async () => {
      const past = { pairingCode: 'ABCD-2345', pairingString: 'dude-pair:v1:hub.local:47600:ABCD2345:' + 'A'.repeat(43), expiresAt: new Date(Date.now() - 1000).toISOString(), hubUrl: 'u', spkiSha256: 'A'.repeat(43) };
      const { fixture, el, port } = await mount({ createPairingCode: async () => past });
      buttonWithText(el, 'Pair a device').click();
      await settle(fixture);
      expect(text(el, 'pairing-expired')).toContain('expired');
      expect(el.querySelector('[data-testid="pairing-string"]')).toBeNull();
      expect(el.querySelector('[data-testid="pairing-code"]')).toBeNull();
      buttonWithText(el, 'Create a new code').click();
      await settle(fixture);
      expect(port.createPairingCode).toHaveBeenCalledTimes(2);
    });
  });

  describe('rename', () => {
    it('validates 1 to 64 characters without control characters', async () => {
      const { fixture, el, port } = await mount();
      buttonWithText(el, 'Rename').click();
      await settle(fixture);
      const field = el.querySelector('input[aria-label^="New name"]') as HTMLInputElement;
      typeInto(field, '   ');
      await settle(fixture);
      expect(text(el, 'name-error')).toContain('empty');
      expect(buttonWithText(el, 'Save name').disabled).toBe(true);
      typeInto(field, 'x'.repeat(65));
      await settle(fixture);
      expect(text(el, 'name-error')).toContain('64');
      typeInto(field, 'bad\u0007name');
      await settle(fixture);
      expect(text(el, 'name-error')).toContain('control');
      expect(port.renameDevice).not.toHaveBeenCalled();
    });

    it('saves a valid name through the port', async () => {
      const { fixture, el, port } = await mount({ renameDevice: async (id, name) => ({ ...LIST[0], deviceId: id, displayName: name }) });
      buttonWithText(el, 'Rename').click();
      await settle(fixture);
      typeInto(el.querySelector('input[aria-label^="New name"]') as HTMLInputElement, '  Desk  ');
      await settle(fixture);
      buttonWithText(el, 'Save name').click();
      await settle(fixture);
      expect(port.renameDevice).toHaveBeenCalledWith(LIST[0].deviceId, 'Desk');
      expect(text(el, 'device-name')).toBe('Desk');
    });
  });

  describe('recovery trust', () => {
    it('asks for the owner password every time and explains what trusted means', async () => {
      const { fixture, el, port } = await mount();
      buttonWithText(el, 'Remove recovery trust').click();
      await settle(fixture);
      expect(port.setRecoveryTrust).not.toHaveBeenCalled();
      expect(text(el, 'trust-prompt')).toContain('no longer be able to reset the owner password');
      expect(buttonWithText(el, 'Remove trust').disabled).toBe(true);
      typeInto(el.querySelector('#trust-password') as HTMLInputElement, PASSWORD);
      await settle(fixture);
      buttonWithText(el, 'Remove trust').click();
      await settle(fixture);
      expect(port.setRecoveryTrust).toHaveBeenCalledExactlyOnceWith(LIST[0].deviceId, PASSWORD, false);
      expect(el.querySelector('[data-testid="trust-prompt"]')).toBeNull();
      expect(row(el, 0).textContent).not.toContain('Recovery-trusted');
    });

    it('describes trusting and keeps the prompt open on a wrong password', async () => {
      const { fixture, el, port } = await mount();
      buttonWithText(el, 'Trust for recovery').click();
      await settle(fixture);
      expect(text(el, 'trust-prompt')).toContain('may reset the owner password after Windows confirms');
      typeInto(el.querySelector('#trust-password') as HTMLInputElement, 'wrong');
      await settle(fixture);
      buttonWithText(el, 'Trust this device').click();
      await settle(fixture);
      expect(port.setRecoveryTrust).toHaveBeenCalledWith(LIST[4].deviceId, 'wrong', true);
      expect(text(el, 'action-error')).toContain('incorrect');
      expect(el.querySelector('[data-testid="trust-prompt"]')).not.toBeNull();
      expect((el.querySelector('#trust-password') as HTMLInputElement).value).toBe('');
    });
  });
});
