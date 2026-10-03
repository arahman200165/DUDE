import { TestBed } from '@angular/core/testing';
import { describe, expect, it, vi } from 'vitest';
import { FAKE_AGENT_DIAGNOSTICS, FAKE_HUB_DIAGNOSTICS } from '../../../../core/platform/testing/fake-hub';
import { CORE_SETTINGS_SECTIONS, settingsSectionAvailability } from '../../settings-sections';
import { buttonWithText, configureHubTest, createTestPort, settle, typeInto } from '../hub/testing/hub-test-port';
import { BrowserChecks, type BrowserEnvironment } from './browser-checks.service';
import { buildCopyReport, redactReport } from './endpoint-format';
import { EndpointSettings } from './endpoint-settings';

const text = (el: HTMLElement, id: string): string => el.querySelector(`[data-testid="${id}"]`)?.textContent?.replace(/\s+/g, ' ').trim() ?? '';

async function mount(port: Parameters<typeof configureHubTest>[0], host: 'desktop' | 'hub-web' = 'desktop') {
  configureHubTest(port, host);
  const fixture = TestBed.createComponent(EndpointSettings);
  fixture.detectChanges();
  await settle(fixture);
  return { fixture, el: fixture.nativeElement as HTMLElement };
}

async function signIn(fixture: Awaited<ReturnType<typeof mount>>['fixture'], el: HTMLElement): Promise<void> {
  typeInto(el.querySelector('#owner-gate-password') as HTMLInputElement, 'correct horse battery');
  await settle(fixture);
  buttonWithText(el, 'Sign in').click();
  await settle(fixture);
}

describe('Endpoint & Exposure section registration', () => {
  const section = CORE_SETTINGS_SECTIONS.find((s) => s.id === 'endpoint');
  it('sits right after Environment & Hub and is hidden on the standalone web build', () => {
    const ids = CORE_SETTINGS_SECTIONS.map((s) => s.id);
    expect(ids.indexOf('endpoint')).toBe(ids.indexOf('environment') + 1);
    expect(section?.title).toBe('Endpoint & Exposure');
    expect(settingsSectionAvailability(section?.hosts, 'desktop')).toBe('available');
    expect(settingsSectionAvailability(section?.hosts, 'hub-web')).toBe('available');
    expect(settingsSectionAvailability(section?.hosts, 'web-standalone')).toBe('hidden');
  });
});

describe('EndpointSettings (desktop)', () => {
  it('shows this device immediately and the owner gate instead of the Hub report while signed out', async () => {
    const { port } = createTestPort({ agentDiagnostics: async () => FAKE_AGENT_DIAGNOSTICS });
    const { el } = await mount(port);
    expect(text(el, 'agent-state')).toBe('Connected');
    expect(text(el, 'agent-latency')).toBe('12 ms');
    expect(text(el, 'agent-sync')).toContain('cursor 42');
    expect(el.querySelector('[data-testid="owner-gate"]')).not.toBeNull();
    expect(el.querySelector('[data-testid="readiness"]')).toBeNull();
    expect(port.diagnostics).not.toHaveBeenCalled();
    expect(el.querySelector('[data-testid="browser-checks"]')).toBeNull();
    expect(text(el, 'view-only-note')).toContain('elevated');
  });

  it('renders exposure, certificate and the readiness checklist after the owner signs in', async () => {
    const { port } = createTestPort({ agentDiagnostics: async () => FAKE_AGENT_DIAGNOSTICS });
    const { fixture, el } = await mount(port);
    await signIn(fixture, el);
    expect(port.diagnostics).toHaveBeenCalledTimes(1);
    expect(text(el, 'exposure-mode')).toBe('Private');
    expect(text(el, 'exposure-bind')).toContain('0.0.0.0:47600');
    expect(text(el, 'exposure-origin')).toBe('https://hub.local:47600');
    expect(text(el, 'cert-source')).toBe('Local CA');
    expect(text(el, 'cert-days')).toBe('59 days left');
    expect(text(el, 'cert-missing')).toContain('192.168.1.20');
    expect(text(el, 'ca-permitted')).toContain('hub.local');
    expect(text(el, 'cert-renewal')).toBe('Automatic');

    expect(text(el, 'check-tls-names')).toContain('Fail');
    expect(text(el, 'check-tls-names')).toContain('Verified');
    expect(text(el, 'check-firewall')).toContain('Pass');
    expect(text(el, 'check-external')).toContain('Not checked — Phase 31F');
    expect(text(el, 'check-external')).not.toContain('Run elevated');
  });

  it('shows the fix command under "Run elevated:" and copies it', async () => {
    const writeText = vi.fn(async () => undefined);
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });
    const { port } = createTestPort({ agentDiagnostics: async () => FAKE_AGENT_DIAGNOSTICS });
    const { fixture, el } = await mount(port);
    await signIn(fixture, el);
    const fix = el.querySelector('[data-testid="check-tls-names"] [data-testid="check-fix"]') as HTMLElement;
    expect(fix.textContent).toContain('Run elevated:');
    expect(fix.textContent).toContain('dude-hub tls reissue --name 192.168.1.20');
    (fix.querySelector('app-copy-button button') as HTMLButtonElement).click();
    await settle(fixture);
    expect(writeText).toHaveBeenCalledWith('dude-hub tls reissue --name 192.168.1.20');
  });

  it('flags a public mode report as not released', async () => {
    const report = { ...FAKE_HUB_DIAGNOSTICS, exposure: { ...FAKE_HUB_DIAGNOSTICS.exposure, mode: 'public' as const } };
    const { port } = createTestPort({ agentDiagnostics: async () => FAKE_AGENT_DIAGNOSTICS, diagnostics: async () => report });
    const { fixture, el } = await mount(port);
    await signIn(fixture, el);
    expect(text(el, 'exposure-mode')).toContain('Public — not released until Phase 31F');
  });

  it('shows a load error and refreshes both reports', async () => {
    const { port } = createTestPort({ agentDiagnostics: async () => FAKE_AGENT_DIAGNOSTICS });
    port.diagnostics.mockRejectedValueOnce(new Error('Hub exploded'));
    const { fixture, el } = await mount(port);
    await signIn(fixture, el);
    expect(text(el, 'report-error')).toBe('Hub exploded');
    (el.querySelector('[data-testid="refresh"]') as HTMLButtonElement).click();
    await settle(fixture);
    expect(port.diagnostics).toHaveBeenCalledTimes(2);
    expect(port.agentDiagnostics).toHaveBeenCalledTimes(2);
    expect(el.querySelector('[data-testid="report-error"]')).toBeNull();
    expect(el.querySelector('[data-testid="readiness"]')).not.toBeNull();
  });

  it('puts both reports in the copied text, with credential-named fields and URL queries removed', async () => {
    const writeText = vi.fn(async () => undefined);
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });
    const { port } = createTestPort({ agentDiagnostics: async () => ({ ...FAKE_AGENT_DIAGNOSTICS, hubUrl: 'https://hub.local:47600/?token=abc' }) });
    const { fixture, el } = await mount(port);
    await signIn(fixture, el);
    const copy = Array.from(el.querySelectorAll('app-copy-button button')).find((b) => b.textContent?.includes('Copy redacted report')) as HTMLButtonElement;
    copy.click();
    await settle(fixture);
    const copied = String((writeText.mock.calls[0] as unknown[])[0]);
    expect(copied).not.toContain('token=');
    const parsed = JSON.parse(copied);
    expect(parsed.agent.hubUrl).toBe('https://hub.local:47600/');
    expect(parsed.hub.exposure.port).toBe(47600);
  });
});

describe('redactReport', () => {
  it('drops token/secret-named fields at any depth and strips URL queries', () => {
    const out = redactReport({ hubUrl: 'https://h:1/?a=b#c', nested: [{ deviceToken: 'x', apiSecret: 'y', ok: 1, canonicalOrigin: 'https://h:1/p?q=1' }] });
    expect(out).toEqual({ hubUrl: 'https://h:1/', nested: [{ ok: 1, canonicalOrigin: 'https://h:1/p' }] });
    expect(buildCopyReport(null, null)).toBe(JSON.stringify({ agent: null, hub: null }, null, 2));
  });
});

describe('EndpointSettings (Hub web)', () => {
  const env = (over: Partial<BrowserEnvironment> = {}): BrowserEnvironment => ({
    isSecureContext: true,
    location: { origin: 'https://hub.local:47600', protocol: 'https:', host: 'hub.local:47600' },
    serviceWorker: async () => ({ supported: true, controlling: false, registered: false }),
    openSocket: () => {
      const socket = { onopen: null, onmessage: null, onerror: null, onclose: null, send: () => undefined, close: () => undefined } as any;
      queueMicrotask(() => socket.onmessage?.({ data: JSON.stringify({ type: 'welcome' }) }));
      return socket;
    },
    now: () => Date.parse('2026-10-01T10:00:00Z'),
    ...over,
  });

  it('has no "This device" panel, runs the browser checks and offers the local-CA root when the certificate may not be trusted', async () => {
    const { port } = createTestPort({
      ownerStatus: async () => ({ signedIn: true, ownerDisplayName: 'Alex', expiresAt: null }),
      diagnostics: async () => FAKE_HUB_DIAGNOSTICS,
      serverDate: async () => 'Thu, 01 Oct 2026 10:05:00 GMT',
      tlsCertificates: async () => ({
        active: { spkiSha256: 'A'.repeat(43), certPem: '' }, next: null, source: 'local-ca' as const,
        caCertPem: `-----BEGIN CERTIFICATE-----\n${btoa('abc')}\n-----END CERTIFICATE-----`, leafNotAfter: '2027-01-01T00:00:00Z',
      }),
    });
    configureHubTest(port, 'hub-web');
    TestBed.inject(BrowserChecks).environment = () => env();
    const fixture = TestBed.createComponent(EndpointSettings);
    fixture.detectChanges();
    await settle(fixture);
    const el = fixture.nativeElement as HTMLElement;
    expect(el.querySelector('[data-testid="this-device"]')).toBeNull();
    expect(port.diagnostics).toHaveBeenCalled();
    expect(text(el, 'check-secure-context')).toContain('yes');
    expect(text(el, 'check-trust')).toContain('Certificate may not be trusted');
    expect(el.querySelector('[data-testid="root-download"]')).not.toBeNull();
    expect(text(el, 'check-realtime')).toContain('reachable');
    expect(text(el, 'check-skew')).toContain('300 s');
    expect(text(el, 'check-skew')).toContain('differs');
    expect(text(el, 'origin-match')).toContain('canonical origin');
    expect(text(el, 'sw-state')).toBe('None');
  });

  it('treats a registered service worker as a trusted certificate and hides the root download', async () => {
    const { port } = createTestPort({
      ownerStatus: async () => ({ signedIn: true, ownerDisplayName: 'Alex', expiresAt: null }),
      diagnostics: async () => FAKE_HUB_DIAGNOSTICS,
      serverDate: async () => null,
    });
    configureHubTest(port, 'hub-web');
    TestBed.inject(BrowserChecks).environment = () => env({ serviceWorker: async () => ({ supported: true, controlling: true, registered: true }) });
    const fixture = TestBed.createComponent(EndpointSettings);
    fixture.detectChanges();
    await settle(fixture);
    const el = fixture.nativeElement as HTMLElement;
    expect(text(el, 'check-trust')).toContain('Certificate trusted');
    expect(el.querySelector('[data-testid="root-download"]')).toBeNull();
    expect(text(el, 'check-skew')).toContain('unknown');
  });
});
