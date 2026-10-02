import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import type { BackgroundAgentStatus, StoreHealth, StoreStatus } from '@dude/contracts';
import { DeviceAgentService } from '../../../core/device/device-agent.service';
import { DeviceIdentityService } from '../../../core/device/device-identity.service';
import { DeviceResetService } from '../../../core/device/device-reset.service';
import { DeviceStoreHealthService } from '../../../core/device/device-store-health.service';
import { OutboxStatusService } from '../../../core/persistence/entities/outbox-status.service';
import { CORE_SETTINGS_SECTIONS } from '../settings-sections';
import { ThisDeviceSettings } from './this-device-settings';

const IDENTITY = { deviceId: '0190aaaa-bbbb-7ccc-8ddd-eeeeeeeeeeee', environmentId: '0190ffff-bbbb-7ccc-8ddd-eeeeeeeeeeee', displayName: 'Desk', platform: 'windows', appVersion: '1.2.3', enrollmentState: 'standalone' };

function health(partial: Partial<StoreHealth> = {}): StoreHealth {
  return { status: 'ready', schemaVersion: 4, minReaderVersion: 1, sizeBytes: 2_097_152, outbox: { pending: 0, maxRows: 100, backpressure: false }, legacyImport: 'done', ...partial };
}

interface Options { desktop?: boolean; status?: StoreStatus; health?: StoreHealth | null; outbox?: { pending: number; maxRows: number; backpressure: boolean } | null; identity?: typeof IDENTITY | null; agent?: BackgroundAgentStatus | null; error?: string | null }

function setup(options: Options = {}) {
  const desktop = options.desktop ?? true;
  const rename = vi.fn(async (name: string) => ({ ok: true as const, displayName: name }));
  const retry = vi.fn(async () => undefined);
  const agentStatus = signal<BackgroundAgentStatus | null>(options.agent ?? null);
  const agent = {
    available: options.agent !== undefined,
    status: agentStatus,
    busy: signal(false),
    error: signal<string | null>(options.error ?? null),
    refresh: vi.fn(async () => undefined),
    setAutostart: vi.fn(async () => undefined),
    stop: vi.fn(async () => undefined),
    start: vi.fn(async () => undefined),
  };
  const resets = { preview: vi.fn(), apply: vi.fn(), quarantinePreview: vi.fn(), quarantineApply: vi.fn(), openFolder: vi.fn(async () => ({ ok: true })) };
  TestBed.configureTestingModule({
    providers: [
      { provide: DeviceIdentityService, useValue: { identity: signal(options.identity === undefined ? IDENTITY : options.identity), rename } },
      {
        provide: DeviceStoreHealthService,
        useValue: { isDesktopStore: desktop, status: signal(desktop ? (options.status ?? 'ready') : null), health: signal(options.health ?? (desktop ? health() : null)), retrying: signal(false), retry },
      },
      { provide: OutboxStatusService, useValue: { status: signal(options.outbox ?? null) } },
      { provide: DeviceResetService, useValue: resets },
      { provide: DeviceAgentService, useValue: agent },
    ],
  });
  const fixture = TestBed.createComponent(ThisDeviceSettings);
  fixture.detectChanges();
  const el = fixture.nativeElement as HTMLElement;
  const button = (text: string): HTMLButtonElement | undefined => Array.from(el.querySelectorAll('button')).find((b) => b.textContent?.trim() === text);
  return { fixture, el, rename, retry, resets, button, agent, agentStatus };
}

describe('ThisDeviceSettings', () => {
  it('is registered as a core section available on web', () => {
    const section = CORE_SETTINGS_SECTIONS.find((s) => s.id === 'device')!;
    expect(section.title).toBe('This Device');
    expect(section.hosts).toBeUndefined();
  });

  const ENROLLMENT = { environmentId: '0190ffff-bbbb-7ccc-8ddd-eeeeeeeeeeee', hubInstanceId: 'hub-1', hubUrl: 'https://hub.local:8443', enrolledAt: '2026-01-03T00:00:00.000Z' };
  it('describes an enrolled device in plain copy', () => {
    const { el } = setup({ identity: { ...IDENTITY, enrollmentState: 'enrolled', enrollment: ENROLLMENT } as never });
    expect(el.querySelector('[data-testid="enrollment"]')?.textContent).toBe('Enrolled in 0190ffff at https://hub.local:8443');
  });

  it('describes a revoked device in plain copy', () => {
    const { el } = setup({ identity: { ...IDENTITY, enrollmentState: 'revoked', enrollment: ENROLLMENT } as never });
    expect(el.querySelector('[data-testid="enrollment"]')?.textContent).toBe('Revoked by the Hub — re-pair to reconnect');
  });

  it('renders identity, platform, environment and enrollment', () => {
    const { el } = setup();
    expect(el.querySelector('[data-testid="device-id"]')?.textContent).toBe(IDENTITY.deviceId);
    expect(el.querySelector('[data-testid="environment-id"]')?.textContent).toBe(IDENTITY.environmentId);
    expect(el.querySelector('[data-testid="enrollment"]')?.textContent).toContain('Standalone — no Hub');
    expect(el.textContent).toContain('DUDE 1.2.3');
    expect((el.querySelector('input[aria-label="Device name"]') as HTMLInputElement).value).toBe('Desk');
  });

  it('has a copy button for the device id', () => {
    const { el } = setup();
    const copy = Array.from(el.querySelectorAll('app-copy-button button')).find((b) => b.textContent?.trim() === 'Copy');
    expect(copy).toBeDefined();
  });

  it('shows store status, schema version, size and legacy import on desktop', () => {
    const { el } = setup();
    expect(el.querySelector('[data-testid="store-status"]')?.textContent).toBe('ready');
    expect(el.textContent).toContain('Schema version');
    expect(el.textContent).toContain('2.0 MB');
    expect(el.textContent).toContain('Imported');
  });

  it('web shows identity but no store panel or recovery', () => {
    const { el } = setup({ desktop: false, identity: { ...IDENTITY, platform: 'web', appVersion: undefined as never } });
    expect(el.querySelector('[data-testid="store"]')).toBeNull();
    expect(el.querySelector('[data-testid="recovery"]')).toBeNull();
    expect(el.querySelector('[data-testid="device-id"]')).not.toBeNull();
    expect(el.querySelector('[data-testid="danger-zone"]')).not.toBeNull();
  });

  it('validates the name before saving and saves a valid one through the identity service', async () => {
    const { fixture, el, rename, button } = setup();
    const input = el.querySelector('input[aria-label="Device name"]') as HTMLInputElement;
    input.value = '   ';
    input.dispatchEvent(new Event('input'));
    fixture.detectChanges();
    expect(el.querySelector('[data-testid="name-error"]')?.textContent).toContain('cannot be empty');
    expect(button('Save name')!.disabled).toBe(true);

    input.value = 'x'.repeat(65);
    input.dispatchEvent(new Event('input'));
    fixture.detectChanges();
    expect(el.querySelector('[data-testid="name-error"]')?.textContent).toContain('64 characters');

    input.value = 'Workstation';
    input.dispatchEvent(new Event('input'));
    fixture.detectChanges();
    expect(el.querySelector('[data-testid="name-error"]')).toBeNull();
    button('Save name')!.click();
    await fixture.whenStable();
    expect(rename).toHaveBeenCalledWith('Workstation');
  });

  it('shows the outbox count and a backpressure warning', () => {
    const quiet = setup({ outbox: { pending: 3, maxRows: 100, backpressure: false } });
    expect(quiet.el.querySelector('[data-testid="outbox-count"]')?.textContent).toBe('3');
    expect(quiet.el.querySelector('[data-testid="backpressure"]')).toBeNull();
    TestBed.resetTestingModule();
    const full = setup({ outbox: { pending: 100, maxRows: 100, backpressure: true } });
    expect(full.el.querySelector('[data-testid="backpressure"]')?.textContent).toContain('100');
  });

  it('offers no recovery while the store is healthy', () => {
    const { el } = setup();
    expect(el.querySelector('[data-testid="recovery"]')).toBeNull();
  });

  it('unavailable: Retry and Open store folder, no quarantine; Retry calls the health service', () => {
    const { el, button, retry } = setup({ status: 'unavailable' });
    expect(button('Retry')).toBeDefined();
    expect(button('Open store folder')).toBeDefined();
    expect(button('Quarantine & reset…')).toBeUndefined();
    button('Retry')!.click();
    expect(retry).toHaveBeenCalledOnce();
    expect(el.querySelector('[data-testid="no-identity"]')).toBeNull();
  });

  it.each<StoreStatus>(['incompatible', 'corrupt'])('%s: offers Quarantine & reset and Open store folder, not Retry', (status) => {
    const { button } = setup({ status });
    expect(button('Quarantine & reset…')).toBeDefined();
    expect(button('Open store folder')).toBeDefined();
    expect(button('Retry')).toBeUndefined();
  });

  it('Open store folder sends no path', async () => {
    const { button, resets, fixture } = setup({ status: 'corrupt' });
    button('Open store folder')!.click();
    await fixture.whenStable();
    expect(resets.openFolder).toHaveBeenCalledWith();
  });

  it('disables the danger actions while the store is not ready', () => {
    const { button } = setup({ status: 'corrupt' });
    expect(button('Clear data…')!.disabled).toBe(true);
    expect(button('Reset this device…')!.disabled).toBe(true);
  });

  it('shows a notice when the identity is unavailable', () => {
    const { el } = setup({ identity: null, status: 'unavailable' });
    expect(el.querySelector('[data-testid="no-identity"]')).not.toBeNull();
  });

  describe('background agent', () => {
    const RUNNING: BackgroundAgentStatus = { running: true, stoppedByUser: false, autostart: 'enabled', mechanism: 'run-key' };

    it('is hidden on web', () => {
      const { el } = setup({ desktop: false });
      expect(el.querySelector('[data-testid="background-agent"]')).toBeNull();
    });

    it('shows the plain description, a running state and a checked sign-in toggle, and refreshes on open', () => {
      const { el, agent } = setup({ agent: RUNNING });
      expect(agent.refresh).toHaveBeenCalled();
      expect(el.querySelector('[data-testid="background-agent"]')?.textContent).toContain('Keeps your device store available to DUDE when the window is closed.');
      expect(el.querySelector('[data-testid="agent-state"]')?.textContent).toBe('Running');
      expect((el.querySelector('[data-testid="agent-autostart"]') as HTMLInputElement).checked).toBe(true);
      expect(el.querySelector('[data-testid="agent-dev-note"]')).toBeNull();
    });

    it('toggling start at sign-in and stopping call the service', () => {
      const { fixture, el, agent, button } = setup({ agent: { ...RUNNING, autostart: 'disabled', mechanism: null } });
      const toggle = el.querySelector('[data-testid="agent-autostart"]') as HTMLInputElement;
      expect(toggle.checked).toBe(false);
      toggle.checked = true;
      toggle.dispatchEvent(new Event('change'));
      expect(agent.setAutostart).toHaveBeenCalledWith(true);
      button('Stop background agent')!.click();
      expect(agent.stop).toHaveBeenCalledTimes(1);
      fixture.detectChanges();
    });

    it('a stopped agent shows Stopped and a Start action instead of Stop', () => {
      const { fixture, el, agent, agentStatus, button } = setup({ agent: { ...RUNNING, running: false, stoppedByUser: true } });
      expect(el.querySelector('[data-testid="agent-state"]')?.textContent).toBe('Stopped');
      expect(button('Stop background agent')).toBeUndefined();
      button('Start')!.click();
      expect(agent.start).toHaveBeenCalledTimes(1);
      agentStatus.set({ ...RUNNING, running: false, stoppedByUser: false });
      fixture.detectChanges();
      expect(el.querySelector('[data-testid="agent-state"]')?.textContent).toBe('Not running');
    });

    it('a development build disables the toggle and says it is not available', () => {
      const { el } = setup({ agent: { running: true, stoppedByUser: false, autostart: 'unsupported-in-dev', mechanism: null } });
      expect((el.querySelector('[data-testid="agent-autostart"]') as HTMLInputElement).disabled).toBe(true);
      expect(el.querySelector('[data-testid="agent-dev-note"]')?.textContent).toContain('Not available in development build');
    });

    it('shows why an action failed', () => {
      const { el } = setup({ agent: RUNNING, error: 'Could not set DUDE to start at sign-in.' });
      expect(el.querySelector('[data-testid="agent-error"]')?.textContent).toContain('Could not set DUDE to start at sign-in.');
    });
  });
});
