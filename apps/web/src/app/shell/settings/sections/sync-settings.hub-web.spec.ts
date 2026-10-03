import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import type { SyncDeviceSummary } from '@dude/contracts/hub';
import { DesktopHandoffService } from '../../../core/deep-link/desktop-handoff.service';
import { HUB_ADMIN } from '../../../core/hub/hub-admin.token';
import { SYNC_PORT } from '../../../core/sync/sync.port';
import { createFakeSyncPort, syncStatus } from '../../../core/sync/testing/fake-sync-port';
import { fakeHubAdmin } from '../../hub/fake-hub-admin.spec-helper';
import { SyncSettings } from './sync-settings';
import { buildRows } from './sync/hub-web-sync';

async function settle(fixture: { whenStable(): Promise<unknown>; detectChanges(): void }): Promise<void> {
  for (let i = 0; i < 3; i++) {
    await new Promise<void>((resolve) => setTimeout(resolve));
    await fixture.whenStable();
    fixture.detectChanges();
  }
}

const summary = (patch: Partial<SyncDeviceSummary>): SyncDeviceSummary => ({
  deviceId: 'dddddddd-0000', kind: 'desktop', paused: false, cursor: 5, lag: 0, lastPushAt: null, lastPullAt: '2026-10-03T10:00:00.000Z', quarantined: 0, conflicts: 0, pending: 0, ...patch,
});

async function mount(devices: SyncDeviceSummary[], status = syncStatus(), open: ReturnType<typeof vi.fn> = vi.fn(async () => 'opened')) {
  const fake = createFakeSyncPort({ host: 'web' } as never, status);
  const admin = fakeHubAdmin();
  admin.syncSummary.mockResolvedValue({ floor: 0, headRevision: 5, retentionDays: 30, counts: {}, devices });
  admin.listDevices.mockResolvedValue([
    { deviceId: 'dddddddd-0000', displayName: 'Work PC' },
    { deviceId: 'bbbbbbbb-0000', displayName: 'Browser · Chrome on Windows' },
  ]);
  TestBed.configureTestingModule({
    providers: [
      provideRouter([]),
      { provide: SYNC_PORT, useValue: fake.port },
      { provide: HUB_ADMIN, useValue: admin },
      { provide: DesktopHandoffService, useValue: { enabled: true, open } },
    ],
  });
  const fixture = TestBed.createComponent(SyncSettings);
  fixture.detectChanges();
  await settle(fixture);
  return { fixture, el: fixture.nativeElement as HTMLElement, fake, admin, open };
}
const q = (el: HTMLElement, id: string) => el.querySelector<HTMLElement>(`[data-testid="${id}"]`);

describe('SyncSettings on Hub-served web', () => {
  it('shows the browser state and the Web access copy, and hides the desktop-only panels', async () => {
    const { el } = await mount([summary({})]);
    expect(q(el, 'hub-web-sync')).not.toBeNull();
    expect(q(el, 'phase-copy')?.textContent).toContain('Live');
    expect(q(el, 'web-access-copy')?.textContent).toContain('every browser signed in');
    expect(q(el, 'web-access-copy')?.textContent).toContain('not to desktops');
    expect(el.textContent).toContain('Web access');
    for (const id of ['pause', 'start-first-sync', 'standalone-preview', 'standalone-confirm', 'held-stranded']) expect(q(el, id), id).toBeNull();
    expect(el.querySelector('app-first-sync-wizard, app-conflict-inbox, app-quarantine-list')).toBeNull();
  });

  it('says so when the Hub is unreachable, and locks the toggles', async () => {
    const { el } = await mount([], syncStatus({ phase: 'offline' }));
    expect(q(el, 'phase-copy')?.textContent).toContain('Hub unreachable — changes paused');
    expect((q(el, 'toggle-settings') as HTMLInputElement).disabled).toBe(true);
  });

  it('toggling a Web access category goes through the port (webAccessSet)', async () => {
    const { fixture, el, fake } = await mount([summary({})]);
    const box = q(el, 'toggle-scratchpad') as HTMLInputElement;
    expect(box.checked).toBe(false);
    box.checked = true;
    box.dispatchEvent(new Event('change'));
    await settle(fixture);
    expect(fake.port.setCategories).toHaveBeenCalledWith({ scratchpad: true });
  });

  it('Sync now pulls through the port and reloads the device table', async () => {
    const { fixture, el, fake, admin } = await mount([summary({})]);
    const before = admin.syncSummary.mock.calls.length;
    q(el, 'sync-now')!.click();
    await settle(fixture);
    expect(fake.port.syncNow).toHaveBeenCalled();
    expect(admin.syncSummary.mock.calls.length).toBeGreaterThan(before);
  });

  it('lists every device with its kind, counts and joined display name', async () => {
    const { el } = await mount([
      summary({}),
      summary({ deviceId: 'bbbbbbbb-0000', kind: 'browser', cursor: 5, lag: 2, lastPushAt: '2026-10-03T09:00:00.000Z' }),
    ]);
    const rows = Array.from(el.querySelectorAll('[data-testid="device-row"]'));
    expect(rows).toHaveLength(2);
    const text = rows.map((r) => r.textContent ?? '').join('|');
    expect(text).toContain('Work PC');
    expect(text).toContain('Browser · Chrome on Windows');
    expect(rows.map((r) => r.getAttribute('data-kind')).sort()).toEqual(['browser', 'desktop']);
    expect(el.textContent).toContain('Desktop');
    expect(el.textContent).toContain('Browser');
  });

  it('points desktop rows with conflicts or quarantine at DUDE Desktop and offers the hand-off', async () => {
    const { fixture, el, open } = await mount([summary({ conflicts: 2, quarantined: 1 }), summary({ deviceId: 'bbbbbbbb-0000', kind: 'browser', conflicts: 3 })]);
    const resolve = el.querySelectorAll('[data-testid="resolve-row"]');
    expect(resolve).toHaveLength(1);
    expect(resolve[0]?.textContent).toContain('Resolve in DUDE Desktop');
    q(el, 'open-desktop')!.click();
    await settle(fixture);
    expect(open).toHaveBeenCalledWith({ action: 'open', target: 'settings', section: 'sync' });
  });

  it('offers the download when Desktop did not take focus', async () => {
    const { fixture, el } = await mount([summary({ conflicts: 1 })], syncStatus(), vi.fn(async () => 'not-detected'));
    q(el, 'open-desktop')!.click();
    await settle(fixture);
    expect(q(el, 'handoff-missing')).not.toBeNull();
  });

  it('shows an error instead of a table when the Hub summary fails', async () => {
    const fake = createFakeSyncPort({ host: 'web' } as never, syncStatus());
    const admin = fakeHubAdmin();
    admin.syncSummary.mockRejectedValue(new Error('down'));
    admin.listDevices.mockResolvedValue([]);
    TestBed.configureTestingModule({ providers: [provideRouter([]), { provide: SYNC_PORT, useValue: fake.port }, { provide: HUB_ADMIN, useValue: admin }] });
    const fixture = TestBed.createComponent(SyncSettings);
    fixture.detectChanges();
    await settle(fixture);
    expect(q(fixture.nativeElement, 'devices-error')).not.toBeNull();
  });
});

describe('buildRows', () => {
  it('puts this browser first and falls back to a short id when the device list lacks a name', () => {
    const rows = buildRows([summary({ deviceId: 'aaaaaaaa-1111' }), summary({ deviceId: 'bbbbbbbb-0000', kind: 'browser' })], [{ deviceId: 'bbbbbbbb-0000', displayName: 'Me' }], 'bbbbbbbb-0000');
    expect(rows[0]).toMatchObject({ name: 'Me', self: true });
    expect(rows[1]?.name).toBe('Device aaaaaaaa');
  });
});
