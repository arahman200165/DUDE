import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import type { ResetKind } from '@dude/contracts';
import { DeviceIdentityService } from '../../../core/device/device-identity.service';
import { DeviceResetService } from '../../../core/device/device-reset.service';
import { DeviceStoreHealthService } from '../../../core/device/device-store-health.service';
import { OutboxStatusService } from '../../../core/persistence/entities/outbox-status.service';
import { PersistenceService } from '../../../core/persistence/persistence.service';
import { PLATFORM_BRIDGE } from '../../../core/platform/platform-bridge.adapter';
import { ClearAllDataService } from '../../../core/workspace/clear-all-data';
import { ThisDeviceSettings } from './this-device-settings';

/**
 * Destructive-Action Contract for Settings > This Device: viewing the page or clicking a danger
 * button only previews. Only the explicit Confirm applies, with the token its preview returned.
 */

const IDENTITY = { deviceId: 'dev-1', environmentId: 'env-1', displayName: 'Desk', platform: 'windows', enrollmentState: 'standalone' };

function buttonWithText(root: HTMLElement, text: string): HTMLButtonElement {
  return Array.from(root.querySelectorAll('button')).find((b) => b.textContent?.trim() === text) as HTMLButtonElement;
}

function desktopSetup() {
  const preview = vi.fn(async (kind: ResetKind) => ({ ok: true as const, kind, token: `tok-${kind}`, counts: { kv: 4, history_entries: 2, outbox: 0 }, expiresAt: new Date(Date.now() + 60_000).toISOString(), keepsIdentity: kind === 'clear-data', wipesSecrets: kind === 'reset-device' }));
  const apply = vi.fn(async () => ({ ok: true as const }));
  const bridge = { store: { reset: { preview, apply }, recovery: { openFolder: vi.fn(), quarantinePreview: vi.fn(), quarantineApply: vi.fn() } } };
  TestBed.configureTestingModule({
    providers: [
      { provide: PLATFORM_BRIDGE, useValue: { get: () => bridge } },
      { provide: DeviceIdentityService, useValue: { identity: signal(IDENTITY), rename: vi.fn(), resetInstallation: vi.fn() } },
      { provide: DeviceStoreHealthService, useValue: { isDesktopStore: true, status: signal('ready'), health: signal(null), retrying: signal(false), retry: vi.fn() } },
      { provide: OutboxStatusService, useValue: { status: signal(null) } },
    ],
  });
  const fixture = TestBed.createComponent(ThisDeviceSettings);
  fixture.detectChanges();
  return { fixture, el: fixture.nativeElement as HTMLElement, preview, apply };
}

async function settle(fixture: { whenStable(): Promise<unknown>; detectChanges(): void }): Promise<void> {
  await fixture.whenStable();
  fixture.detectChanges();
}

describe('This Device confirmation boundary (desktop)', () => {
  it('rendering the section previews and applies nothing', async () => {
    const { fixture, preview, apply } = desktopSetup();
    await settle(fixture);
    expect(preview).not.toHaveBeenCalled();
    expect(apply).not.toHaveBeenCalled();
  });

  it.each<[string, ResetKind]>([['Clear data…', 'clear-data'], ['Reset this device…', 'reset-device']])('%s only previews', async (label, kind) => {
    const { fixture, el, preview, apply } = desktopSetup();
    buttonWithText(el, label).click();
    await settle(fixture);
    expect(preview).toHaveBeenCalledWith(kind);
    expect(apply).not.toHaveBeenCalled();
    const panel = el.querySelector('[role="alertdialog"]');
    expect(panel).not.toBeNull();
    expect(panel!.textContent).toContain('4 saved settings and tool state');
    expect(panel!.textContent).toContain('2 History entries');
  });

  it('Confirm applies with exactly the preview token', async () => {
    const { fixture, el, apply } = desktopSetup();
    buttonWithText(el, 'Reset this device…').click();
    await settle(fixture);
    buttonWithText(el, 'Confirm reset this device').click();
    await settle(fixture);
    expect(apply).toHaveBeenCalledTimes(1);
    expect(apply).toHaveBeenCalledWith({ kind: 'reset-device', token: 'tok-reset-device' });
    expect(el.querySelector('[role="alertdialog"]')).toBeNull();
  });

  it('Cancel calls nothing and discards the preview', async () => {
    const { fixture, el, apply } = desktopSetup();
    buttonWithText(el, 'Clear data…').click();
    await settle(fixture);
    buttonWithText(el, 'Cancel').click();
    await settle(fixture);
    expect(el.querySelector('[role="alertdialog"]')).toBeNull();
    expect(apply).not.toHaveBeenCalled();
  });

  it('a second Confirm click cannot re-apply (preview is consumed)', async () => {
    const { fixture, el, apply } = desktopSetup();
    buttonWithText(el, 'Clear data…').click();
    await settle(fixture);
    const confirm = buttonWithText(el, 'Confirm clear data');
    confirm.click();
    confirm.click();
    await settle(fixture);
    expect(apply).toHaveBeenCalledTimes(1);
  });

  it('a failed apply (stale preview) is reported and nothing is retried', async () => {
    const { fixture, el, apply } = desktopSetup();
    apply.mockResolvedValueOnce({ ok: false, error: 'stale-preview' } as never);
    buttonWithText(el, 'Clear data…').click();
    await settle(fixture);
    buttonWithText(el, 'Confirm clear data').click();
    await settle(fixture);
    expect(apply).toHaveBeenCalledTimes(1);
    expect(el.querySelector('[data-testid="message"]')?.textContent).toContain('changed after the preview');
  });
});

describe('This Device confirmation boundary (web)', () => {
  function webSetup() {
    const clearAll = vi.fn(async () => undefined);
    const resetInstallation = vi.fn();
    TestBed.configureTestingModule({
      providers: [
        { provide: PLATFORM_BRIDGE, useValue: { get: () => undefined } },
        { provide: ClearAllDataService, useValue: { clearAll } },
        { provide: PersistenceService, useValue: { countClearable: () => 5 } },
        { provide: DeviceIdentityService, useValue: { identity: signal({ ...IDENTITY, platform: 'web' }), rename: vi.fn(), resetInstallation } },
        { provide: DeviceStoreHealthService, useValue: { isDesktopStore: false, status: signal(null), health: signal(null), retrying: signal(false), retry: vi.fn() } },
        { provide: OutboxStatusService, useValue: { status: signal(null) } },
        DeviceResetService,
      ],
    });
    const fixture = TestBed.createComponent(ThisDeviceSettings);
    fixture.detectChanges();
    return { fixture, el: fixture.nativeElement as HTMLElement, clearAll, resetInstallation };
  }

  it('rendering and previewing never clear anything', async () => {
    const { fixture, el, clearAll, resetInstallation } = webSetup();
    await settle(fixture);
    buttonWithText(el, 'Clear data…').click();
    await settle(fixture);
    buttonWithText(el, 'Reset this device…').click();
    await settle(fixture);
    expect(el.querySelector('[role="alertdialog"]')).not.toBeNull();
    expect(clearAll).not.toHaveBeenCalled();
    expect(resetInstallation).not.toHaveBeenCalled();
  });

  it('Cancel clears nothing', async () => {
    const { fixture, el, clearAll } = webSetup();
    buttonWithText(el, 'Clear data…').click();
    await settle(fixture);
    buttonWithText(el, 'Cancel').click();
    await settle(fixture);
    expect(clearAll).not.toHaveBeenCalled();
  });

  it('Clear data confirms once, keeps the installation id', async () => {
    const { fixture, el, clearAll, resetInstallation } = webSetup();
    buttonWithText(el, 'Clear data…').click();
    await settle(fixture);
    expect(el.querySelector('[role="alertdialog"]')!.textContent).toContain('5 saved settings');
    buttonWithText(el, 'Confirm clear data').click();
    await settle(fixture);
    expect(clearAll).toHaveBeenCalledTimes(1);
    expect(resetInstallation).not.toHaveBeenCalled();
  });

  it('Reset this device clears data and mints a new installation id', async () => {
    const { fixture, el, clearAll, resetInstallation } = webSetup();
    buttonWithText(el, 'Reset this device…').click();
    await settle(fixture);
    buttonWithText(el, 'Confirm reset this device').click();
    await settle(fixture);
    expect(clearAll).toHaveBeenCalledTimes(1);
    expect(resetInstallation).toHaveBeenCalledTimes(1);
  });

  it('the service rejects apply without a matching preview token', async () => {
    webSetup();
    const service = TestBed.inject(DeviceResetService);
    const clearAll = TestBed.inject(ClearAllDataService).clearAll as ReturnType<typeof vi.fn>;
    expect(await service.apply({ kind: 'clear-data', token: 'guess' })).toEqual({ ok: false, error: 'invalid-token' });
    const preview = await service.preview('clear-data');
    if (!preview.ok) throw new Error('preview failed');
    expect(await service.apply({ kind: 'reset-device', token: preview.token })).toEqual({ ok: false, error: 'invalid-token' });
    expect(await service.apply({ kind: 'clear-data', token: preview.token })).toEqual({ ok: false, error: 'invalid-token' });
    expect(clearAll).not.toHaveBeenCalled();
  });

  it('the web token is single use and expires', async () => {
    webSetup();
    const service = TestBed.inject(DeviceResetService);
    const clearAll = TestBed.inject(ClearAllDataService).clearAll as ReturnType<typeof vi.fn>;
    const first = await service.preview('clear-data');
    if (!first.ok) throw new Error('preview failed');
    expect(await service.apply({ kind: 'clear-data', token: first.token })).toEqual({ ok: true });
    expect(await service.apply({ kind: 'clear-data', token: first.token })).toMatchObject({ ok: false });
    expect(clearAll).toHaveBeenCalledTimes(1);

    const second = await service.preview('clear-data');
    if (!second.ok) throw new Error('preview failed');
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(Date.now() + 61_000);
    try {
      expect(await service.apply({ kind: 'clear-data', token: second.token })).toEqual({ ok: false, error: 'expired' });
    } finally {
      vi.useRealTimers();
    }
    expect(clearAll).toHaveBeenCalledTimes(1);
  });
});
