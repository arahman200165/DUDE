import { TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';
import { HubWebSignOut } from '../../../core/hub-web/hub-web-sign-out.service';
import { HubAdminError } from '../../../core/hub/hub-admin.port';
import { FAKE_HUB_DEVICE_ID, FAKE_HUB_PAIRING_STRING, FAKE_SYNC_SUMMARY } from '../../../core/platform/testing/fake-hub';
import { EnvironmentSettings } from './environment-settings';
import { ENROLLED_STATUS, STANDALONE_STATUS, buttonWithText, configureHubTest, createTestPort, settle, typeInto } from './hub/testing/hub-test-port';

async function mount(port: Parameters<typeof configureHubTest>[0], host: 'desktop' | 'hub-web' = 'desktop') {
  configureHubTest(port, host);
  const fixture = TestBed.createComponent(EnvironmentSettings);
  fixture.detectChanges();
  await settle(fixture);
  return { fixture, el: fixture.nativeElement as HTMLElement };
}
const text = (el: HTMLElement, id: string): string => el.querySelector(`[data-testid="${id}"]`)?.textContent?.trim() ?? '';

describe('EnvironmentSettings (desktop)', () => {
  it('standalone shows the connect form and no disconnect', async () => {
    const { port } = createTestPort({ status: async () => STANDALONE_STATUS });
    const { el } = await mount(port);
    expect(text(el, 'hub-state')).toBe('Standalone');
    expect(el.querySelector('[data-testid="connect"]')).not.toBeNull();
    expect(el.querySelector('[data-testid="disconnect"]')).toBeNull();
    expect(el.textContent).not.toMatch(/syncs|synced|syncing/i);
  });

  it.each([
    ['online', { connection: 'online' as const, reachable: true }, 'Online', 'connected to its Hub'],
    ['offline', { connection: 'offline' as const, reachable: false }, 'Offline', 'cannot be reached'],
    ['connecting', { connection: 'connecting' as const, reachable: null }, 'Connecting', 'Connecting to the Hub'],
    ['incompatible', { connection: 'incompatible' as const, reachable: null }, 'Incompatible version', 'Update whichever one is older'],
    ['untrusted', { connection: 'untrusted-tls' as const, reachable: null }, 'Untrusted Hub certificate', 'Pair again with a fresh pairing string'],
    ['revoked', { enrollmentState: 'revoked' as const, reachable: null }, 'Revoked by the Hub', 'This device was revoked. Pair it again to reconnect.'],
  ])('describes the %s state in plain words', async (_name, patch, label, copy) => {
    const { port } = createTestPort({ status: async () => ({ ...ENROLLED_STATUS, ...patch, lastError: 'boom' }) });
    const { el } = await mount(port);
    expect(text(el, 'hub-state')).toBe(label);
    expect(text(el, 'state-detail')).toContain(copy);
    expect(text(el, 'last-error')).toContain('boom');
    expect(text(el, 'hub-url')).toBe('https://hub.local:47600');
    expect(text(el, 'environment-id')).toBe('0190aaaa');
  });

  it('falls back to reachable when the host sends no connection state', async () => {
    const { port } = createTestPort({ status: async () => ({ ...ENROLLED_STATUS, connection: undefined, reachable: false }) });
    const { el } = await mount(port);
    expect(text(el, 'hub-state')).toBe('Offline');
  });

  it('follows live status changes and unsubscribes on destroy', async () => {
    const { port, emit } = createTestPort({ status: async () => ENROLLED_STATUS });
    const { fixture, el } = await mount(port);
    expect(text(el, 'hub-state')).toBe('Online');
    emit({ ...ENROLLED_STATUS, connection: 'offline', reachable: false });
    await settle(fixture);
    expect(text(el, 'hub-state')).toBe('Offline');
    fixture.destroy();
    emit(ENROLLED_STATUS); // no listener left: must not throw
  });

  it('validates the pairing string client-side', async () => {
    const { port } = createTestPort({ status: async () => STANDALONE_STATUS });
    const { fixture, el } = await mount(port);
    const input = el.querySelector('#pairing-string') as HTMLInputElement;
    typeInto(input, 'https://example.com');
    await settle(fixture);
    expect(text(el, 'pairing-problem')).toContain('not a DUDE pairing string');
    expect(el.querySelector('[data-testid="connect-disclosure"]')).toBeNull();
    typeInto(input, 'dude-pair:v1:hub.local:47600:BAD');
    await settle(fixture);
    expect(text(el, 'pairing-problem')).toContain('incomplete or damaged');
  });

  it('shows host, port and the disclosure before enrolling, and enrolls only on click', async () => {
    const { port } = createTestPort({ status: async () => STANDALONE_STATUS });
    const { fixture, el } = await mount(port);
    typeInto(el.querySelector('#pairing-string') as HTMLInputElement, FAKE_HUB_PAIRING_STRING);
    await settle(fixture);
    expect(text(el, 'parsed-host')).toBe('hub.local:47600');
    expect(text(el, 'connect-disclosure')).toContain("will learn this device's name, platform and app version. Nothing else is uploaded now.");
    expect(port.enroll).not.toHaveBeenCalled();
    buttonWithText(el, 'Connect to this Hub').click();
    await settle(fixture);
    expect(port.enroll).toHaveBeenCalledExactlyOnceWith(FAKE_HUB_PAIRING_STRING);
    expect(text(el, 'connect-done')).toContain('hub.local:47600');
  });

  it('shows progress while connecting', async () => {
    let release: () => void = () => undefined;
    const { port } = createTestPort({
      status: async () => STANDALONE_STATUS,
      enroll: () =>
        new Promise((resolve) => {
          release = () => resolve({ deviceId: 'd', environmentId: 'e', hubInstanceId: 'h', hubUrl: 'u' });
        }),
    });
    const { fixture, el } = await mount(port);
    typeInto(el.querySelector('#pairing-string') as HTMLInputElement, FAKE_HUB_PAIRING_STRING);
    await settle(fixture);
    buttonWithText(el, 'Connect to this Hub').click();
    fixture.detectChanges();
    expect(text(el, 'connecting')).toContain('Connecting');
    release();
    await settle(fixture);
    expect(el.querySelector('[data-testid="connecting"]')).toBeNull();
  });

  it.each([
    ['tls-pin-mismatch', 'certificate does not match'],
    ['pairing-rejected', 'rejected the pairing code'],
    ['hub-unreachable', 'could not be reached'],
    ['incompatible', 'cannot talk to each other'],
    ['already-enrolled', 'already connected'],
    ['dpapi-unavailable', 'DPAPI'],
  ])('explains the %s failure', async (code, snippet) => {
    const { port } = createTestPort({
      status: async () => STANDALONE_STATUS,
      enroll: async () => {
        throw new HubAdminError(code, 'raw');
      },
    });
    const { fixture, el } = await mount(port);
    typeInto(el.querySelector('#pairing-string') as HTMLInputElement, FAKE_HUB_PAIRING_STRING);
    await settle(fixture);
    buttonWithText(el, 'Connect to this Hub').click();
    await settle(fixture);
    expect(text(el, 'connect-error')).toContain(snippet);
  });

  it('shows the owner gate once enrolled', async () => {
    const { port } = createTestPort({ status: async () => ENROLLED_STATUS });
    const { el } = await mount(port);
    expect(el.querySelector('[data-testid="owner-gate"]')).not.toBeNull();
  });
});

describe('EnvironmentSettings reconnect panel (PD-073)', () => {
  const CHANGED = (reason?: 'transferred' | 'instance-changed' | 'epoch-lower') => ({
    ...ENROLLED_STATUS, connection: 'authority-changed' as const, reachable: null,
    ...(reason ? { authority: { reason, hubInstanceId: 'h2', epoch: 2 } } : {}),
  });
  const ack = (el: HTMLElement): HTMLInputElement => el.querySelector('[data-testid="reconnect-ack"]') as HTMLInputElement;
  const input = (el: HTMLElement): HTMLInputElement => el.querySelector('#reconnect-pairing-string') as HTMLInputElement;
  const button = (el: HTMLElement): HTMLButtonElement => el.querySelector('[data-testid="reconnect-button"]') as HTMLButtonElement;

  it.each([
    ['authority-changed', CHANGED('instance-changed')],
    ['untrusted-tls', { ...ENROLLED_STATUS, connection: 'untrusted-tls' as const, reachable: null }],
    ['revoked', { ...ENROLLED_STATUS, enrollmentState: 'revoked' as const, reachable: null, connection: undefined }],
  ])('shows the panel (and not the first-time connect form) when %s', async (_name, status) => {
    const { port } = createTestPort({ status: async () => status });
    const { el } = await mount(port);
    expect(el.querySelector('[data-testid="reconnect"]')).not.toBeNull();
    expect(el.querySelector('[data-testid="connect"]')).toBeNull();
    expect(text(el, 'reconnect-facts')).toContain('Your local data and pending changes are kept. A recovery snapshot is taken first.');
    expect(text(el, 'reconnect-facts')).toContain('Merge, Use Hub or Keep local');
  });

  it.each([
    ['online', ENROLLED_STATUS],
    ['connecting', { ...ENROLLED_STATUS, connection: 'connecting' as const, reachable: null }],
    ['incompatible', { ...ENROLLED_STATUS, connection: 'incompatible' as const, reachable: null }],
    ['standalone', STANDALONE_STATUS],
  ])('does not show the panel or the moved-Hub disclosure when %s', async (_name, status) => {
    const { port } = createTestPort({ status: async () => status });
    const { el } = await mount(port);
    expect(el.querySelector('[data-testid="reconnect"]')).toBeNull();
    expect(el.querySelector('[data-testid="reconnect-moved"]')).toBeNull();
  });

  describe('when the Hub is offline (it may have moved to a new address)', () => {
    const OFFLINE = { ...ENROLLED_STATUS, connection: 'offline' as const, reachable: false };
    const toggle = (el: HTMLElement): HTMLButtonElement => el.querySelector('[data-testid="reconnect-moved"] button') as HTMLButtonElement;

    it('offers the panel inside a disclosure that starts collapsed, with the explanation', async () => {
      const { port } = createTestPort({ status: async () => OFFLINE });
      const { el } = await mount(port);
      expect(el.querySelector('[data-testid="reconnect-moved"]')).not.toBeNull();
      expect(toggle(el).textContent).toContain('The Hub moved to a new address?');
      expect(toggle(el).getAttribute('aria-expanded')).toBe('false');
      expect(el.querySelector('[data-testid="reconnect"]')).toBeNull();
      expect(el.querySelector('[data-testid="reconnect-moved-hint"]')).toBeNull();
      expect(el.querySelector('[data-testid="connect"]')).toBeNull();
    });

    it('renders the one panel when opened, and still needs the pairing string and the acknowledgement', async () => {
      const { port } = createTestPort({ status: async () => OFFLINE });
      const { fixture, el } = await mount(port);
      toggle(el).click();
      await settle(fixture);
      expect(toggle(el).getAttribute('aria-expanded')).toBe('true');
      expect(el.querySelectorAll('[data-testid="reconnect"]')).toHaveLength(1);
      expect(el.querySelectorAll('#reconnect-pairing-string')).toHaveLength(1);
      expect(text(el, 'reconnect-moved-hint')).toBe('If your Hub was moved or restored on another machine and the old one is gone, enter a pairing string from the new Hub. Your local data and pending changes are kept.');
      expect(text(el, 'reconnect-reason')).toBe('This device cannot reach the Hub it was paired with.');
      expect(button(el).disabled).toBe(true);
      typeInto(input(el), FAKE_HUB_PAIRING_STRING);
      await settle(fixture);
      expect(button(el).disabled).toBe(true);
      button(el).click();
      await settle(fixture);
      expect(port.reconnect).not.toHaveBeenCalled();

      ack(el).click();
      await settle(fixture);
      expect(button(el).disabled).toBe(false);
      button(el).click();
      await settle(fixture);
      expect(port.reconnect).toHaveBeenCalledExactlyOnceWith({ pairingString: FAKE_HUB_PAIRING_STRING, acknowledged: true });
    });

    it('is not offered on the Hub-served web build', async () => {
      const { port } = createTestPort({ status: async () => OFFLINE });
      const { el } = await mount(port, 'hub-web');
      expect(el.querySelector('[data-testid="reconnect-moved"]')).toBeNull();
    });

    it('leaves the panel visible, not collapsed, for the blocked states', async () => {
      const { port } = createTestPort({ status: async () => CHANGED('transferred') });
      const { el } = await mount(port);
      expect(el.querySelector('[data-testid="reconnect"]')).not.toBeNull();
      expect(el.querySelector('[data-testid="reconnect-moved"]')).toBeNull();
    });
  });

  it('is not offered on the Hub-served web build', async () => {
    const { port } = createTestPort({ status: async () => CHANGED('transferred') });
    const { el } = await mount(port, 'hub-web');
    expect(el.querySelector('[data-testid="reconnect"]')).toBeNull();
  });

  it.each([
    ['transferred', 'This Hub was moved to another machine.'],
    ['instance-changed', 'This Hub was restored or replaced.'],
    ['epoch-lower', 'This Hub is older than one this device already used.'],
    [undefined, 'This is not the Hub this device was paired with.'],
  ] as const)('explains the %s reason', async (reason, copy) => {
    const { port } = createTestPort({ status: async () => CHANGED(reason) });
    const { el } = await mount(port);
    expect(text(el, 'reconnect-reason')).toBe(copy);
  });

  it('keeps Reconnect disabled until the string is entered AND the acknowledgement is ticked, and never calls without both', async () => {
    const { port } = createTestPort({ status: async () => CHANGED('instance-changed') });
    const { fixture, el } = await mount(port);
    expect(button(el).disabled).toBe(true);
    typeInto(input(el), FAKE_HUB_PAIRING_STRING);
    await settle(fixture);
    expect(text(el, 'reconnect-host')).toBe('hub.local:47600');
    expect(button(el).disabled).toBe(true);
    button(el).click();
    await settle(fixture);
    expect(port.reconnect).not.toHaveBeenCalled();

    ack(el).click();
    await settle(fixture);
    expect(button(el).disabled).toBe(false);
    typeInto(input(el), '');
    await settle(fixture);
    expect(button(el).disabled).toBe(true);
    expect(port.reconnect).not.toHaveBeenCalled();
  });

  it('calls the port once with acknowledged: true, then refreshes the status', async () => {
    const { port } = createTestPort({
      status: async () => CHANGED('instance-changed'),
      reconnect: async () => ({ deviceId: 'd', environmentId: 'e', hubInstanceId: 'h', hubUrl: 'https://hub.local:47600' }),
    });
    const { fixture, el } = await mount(port);
    const statusCalls = port.status.mock.calls.length;
    typeInto(input(el), `  ${FAKE_HUB_PAIRING_STRING}  `);
    ack(el).click();
    await settle(fixture);
    button(el).click();
    await settle(fixture);
    expect(port.reconnect).toHaveBeenCalledExactlyOnceWith({ pairingString: FAKE_HUB_PAIRING_STRING, acknowledged: true });
    expect(port.status.mock.calls.length).toBeGreaterThan(statusCalls);
    expect(text(el, 'reconnect-done')).toContain('Reconnected');
    expect(input(el).value).toBe('');
    expect(ack(el).checked).toBe(false);
  });

  it('shows progress while reconnecting', async () => {
    let release: () => void = () => undefined;
    const { port } = createTestPort({
      status: async () => CHANGED('transferred'),
      reconnect: () => new Promise((resolve) => { release = () => resolve({ deviceId: 'd', environmentId: 'e', hubInstanceId: 'h', hubUrl: 'u' }); }),
    });
    const { fixture, el } = await mount(port);
    typeInto(input(el), FAKE_HUB_PAIRING_STRING);
    ack(el).click();
    await settle(fixture);
    button(el).click();
    fixture.detectChanges();
    expect(text(el, 'reconnecting')).toContain('Reconnecting');
    expect(button(el).disabled).toBe(true);
    release();
    await settle(fixture);
    expect(el.querySelector('[data-testid="reconnecting"]')).toBeNull();
  });

  it.each([
    ['pairing-rejected', 'rejected the pairing code'],
    ['tls-pin-mismatch', 'certificate does not match'],
    ['hub-unreachable', 'could not be reached'],
    ['not-reconnectable', 'nothing to reconnect'],
    ['not-enrolled', 'not connected to a Hub'],
    ['snapshot-failed', 'recovery snapshot could not be taken'],
  ])('explains the %s failure', async (code, snippet) => {
    const { port } = createTestPort({
      status: async () => CHANGED('instance-changed'),
      reconnect: async () => { throw new HubAdminError(code, 'raw'); },
    });
    const { fixture, el } = await mount(port);
    typeInto(input(el), FAKE_HUB_PAIRING_STRING);
    ack(el).click();
    await settle(fixture);
    button(el).click();
    await settle(fixture);
    expect(text(el, 'reconnect-error')).toContain(snippet);
    expect(el.querySelector('[data-testid="reconnect-done"]')).toBeNull();
    expect(input(el).value).toBe(FAKE_HUB_PAIRING_STRING);
  });
});

describe('EnvironmentSettings (Hub web)', () => {
  const hubWebPort = () =>
    createTestPort({
      status: async () => ({ ...ENROLLED_STATUS, hubVersion: '1.4.0', hubInstanceId: '11111111-2222-3333-4444-555555555555', connection: undefined }),
      tlsFingerprint: async () => ({ spkiSha256: 'ABCD'.repeat(10) + 'EFG', nextSpkiSha256: null }),
      ownerStatus: async () => ({ signedIn: true, ownerDisplayName: 'Alex', expiresAt: null }),
      signOut: async () => ({ ok: true as const }),
    });

  it('shows the Hub, its grouped TLS fingerprint and the network commands, with no connect/disconnect', async () => {
    const { port } = hubWebPort();
    const { el } = await mount(port, 'hub-web');
    expect(text(el, 'hub-version')).toBe('1.4.0');
    expect(text(el, 'hub-instance')).toBe('11111111');
    expect(text(el, 'spki')).toBe('ABCD ABCD ABCD ABCD ABCD ABCD ABCD ABCD ABCD ABCD EFG');
    expect(text(el, 'network-exposure')).toContain('Endpoint & Exposure');
    expect(text(el, 'network-exposure')).not.toContain('cannot be read');
    expect((el.querySelector('[data-testid="endpoint-link"]') as HTMLAnchorElement).getAttribute('href')).toBe('/settings/endpoint');
    expect(el.querySelector('[data-testid="connect"]')).toBeNull();
    expect(el.querySelector('[data-testid="disconnect"]')).toBeNull();
    expect(text(el, 'owner-name')).toBe('Alex');
  });

  it('shows the synchronized-record counts, head, retention and floor to a signed-in owner', async () => {
    const { port } = hubWebPort();
    port.syncSummary.mockResolvedValue(FAKE_SYNC_SUMMARY(FAKE_HUB_DEVICE_ID));
    const { el } = await mount(port, 'hub-web');
    expect(port.syncSummary).toHaveBeenCalled();
    expect(text(el, 'sync-count-settings')).toBe('3');
    expect(text(el, 'sync-count-projects')).toBe('2');
    expect(text(el, 'sync-head')).toBe('42');
    expect(text(el, 'sync-retention')).toBe('90 days');
    expect(text(el, 'sync-floor')).toBe('2');
    expect(el.querySelector('[data-testid="sync-summary"]')?.textContent).toContain('Home layout');
  });

  it('shows a summary failure inline without hiding the Hub details', async () => {
    const { port } = createTestPort({
      status: async () => ({ ...ENROLLED_STATUS, hubVersion: '1.4.0', connection: undefined }),
      tlsFingerprint: async () => ({ spkiSha256: 'ABCD'.repeat(10) + 'EFG', nextSpkiSha256: null }),
      ownerStatus: async () => ({ signedIn: true, ownerDisplayName: 'Alex', expiresAt: null }),
      syncSummary: async () => {
        throw new HubAdminError('not-found', 'No such route.');
      },
    });
    const { el } = await mount(port, 'hub-web');
    expect(text(el, 'sync-summary-error')).toContain('No such route');
    expect(text(el, 'hub-version')).toBe('1.4.0');
  });

  it('signs out through the port, then wipes the origin and returns to the sign-in page', async () => {
    const { port } = hubWebPort();
    const completeSignOut = vi.spyOn(HubWebSignOut.prototype, 'completeSignOut').mockResolvedValue();
    const { fixture, el } = await mount(port, 'hub-web');
    const navigate = vi.spyOn(TestBed.inject(Router), 'navigateByUrl').mockResolvedValue(true);
    buttonWithText(el, 'Sign out').click();
    await settle(fixture);
    expect(port.signOut).toHaveBeenCalledOnce();
    expect(port.ownerSignOut).not.toHaveBeenCalled();
    expect(completeSignOut).toHaveBeenCalledOnce();
    expect(navigate).not.toHaveBeenCalled();
  });

  it('a failed sign-out only returns to sign-in and never wipes', async () => {
    const { port } = hubWebPort();
    port.signOut.mockRejectedValueOnce(new HubAdminError('network', 'down'));
    const completeSignOut = vi.spyOn(HubWebSignOut.prototype, 'completeSignOut').mockResolvedValue();
    completeSignOut.mockClear();
    const { fixture, el } = await mount(port, 'hub-web');
    const navigate = vi.spyOn(TestBed.inject(Router), 'navigateByUrl').mockResolvedValue(true);
    buttonWithText(el, 'Sign out').click();
    await settle(fixture);
    expect(completeSignOut).not.toHaveBeenCalled();
    expect(navigate).toHaveBeenCalledWith('/hub/sign-in');
  });
});
