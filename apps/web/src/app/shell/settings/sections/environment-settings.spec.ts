import { TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';
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

  it('signs out through the port and returns to the sign-in page', async () => {
    const { port } = hubWebPort();
    const { fixture, el } = await mount(port, 'hub-web');
    const navigate = vi.spyOn(TestBed.inject(Router), 'navigateByUrl').mockResolvedValue(true);
    buttonWithText(el, 'Sign out').click();
    await settle(fixture);
    expect(port.signOut).toHaveBeenCalledOnce();
    expect(port.ownerSignOut).not.toHaveBeenCalled();
    expect(navigate).toHaveBeenCalledWith('/hub/sign-in');
  });
});
