import { provideZonelessChangeDetection, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { vi } from 'vitest';
import { HUB_NOTIFICATION_KINDS, defaultHubNotificationPreferences } from '@dude/contracts/hub';
import type { HubNotificationPreferences } from '@dude/contracts/hub';
import { HUB_ADMIN } from '../../../../core/hub/hub-admin.token';
import { HUB_NOTIFICATIONS } from '../../../../core/notifications/notifications.port';
import { DesktopPreferencesService } from '../../../../core/platform/desktop-preferences.service';
import { PlatformService } from '../../../../core/platform/platform.service';
import { HUB_EVENTS, HubEventsFeed } from '../../../../core/hub-events/hub-events.port';
import { NotificationsService } from '../../../../core/notifications/notifications.service';
import { DesktopNotificationsPanel, HUB_NOTIFICATION_KIND_LABELS } from './desktop-notifications-panel';
import { HubOwnerSession } from './hub-owner-session.service';
import { createTestPort, device, settle } from './testing/hub-test-port';

const SELF = '0190aaaa-0000-7000-8000-000000000001';

function mount(options: { hostKind?: 'desktop' | 'hub-web'; signedIn?: boolean; self?: Partial<Parameters<typeof device>[2]>; denied?: boolean } = {}) {
  const { port } = createTestPort({ listDevices: async () => [device(SELF, 'This PC', { current: true, ...options.self }), device('0190aaaa-0000-7000-8000-000000000009', 'Other', {})] });
  let stored: HubNotificationPreferences = defaultHubNotificationPreferences();
  const current = signal({ hubNotifications: stored } as never);
  const set = vi.fn(async (patch: { hubNotifications?: HubNotificationPreferences }) => {
    if (patch.hubNotifications) { stored = patch.hubNotifications; current.set({ hubNotifications: stored } as never); }
    return { ok: true as const };
  });
  const prefs = { current, load: vi.fn(async () => undefined), set };
  TestBed.configureTestingModule({
    providers: [
      provideZonelessChangeDetection(),
      { provide: HUB_ADMIN, useValue: port },
      { provide: PlatformService, useValue: { hostKind: options.hostKind ?? 'desktop' } },
      { provide: HubOwnerSession, useValue: { signedIn: signal(options.signedIn ?? false) } },
      { provide: NotificationsService, useValue: { denied: signal(options.denied ?? false) } },
      { provide: DesktopPreferencesService, useValue: prefs },
      { provide: HUB_NOTIFICATIONS, useValue: null },
      { provide: HUB_EVENTS, useExisting: HubEventsFeed },
    ],
  });
  const fixture = TestBed.createComponent(DesktopNotificationsPanel);
  fixture.detectChanges();
  return { fixture, el: fixture.nativeElement as HTMLElement, port, set, prefs, stored: () => stored };
}
const box = (el: HTMLElement, kind: string) => el.querySelector<HTMLInputElement>(`[data-testid="os-notify-${kind}"]`)!;
const status = (el: HTMLElement) => el.querySelector('[data-testid="grant-status"]')?.textContent ?? '';

describe('DesktopNotificationsPanel (PD-110)', () => {
  it('renders nothing off the desktop', async () => {
    const { el, prefs } = mount({ hostKind: 'hub-web' });
    expect(el.querySelector('[data-testid="desktop-notifications"]')).toBeNull();
    expect(prefs.load).not.toHaveBeenCalled();
  });

  it('lists every kind with a friendly label, all off by default', async () => {
    const { el } = mount();
    for (const kind of HUB_NOTIFICATION_KINDS) {
      expect(box(el, kind), kind).not.toBeNull();
      expect(box(el, kind).checked).toBe(false);
      expect(HUB_NOTIFICATION_KIND_LABELS[kind].length).toBeGreaterThan(5);
    }
    expect(el.querySelectorAll('input[type="checkbox"]').length).toBe(HUB_NOTIFICATION_KINDS.length);
  });

  it('saves one kind device-locally through the desktop preferences, leaving the rest off', async () => {
    const { fixture, el, set, stored } = mount();
    box(el, 'backup-failed').click();
    await settle(fixture);
    expect(set).toHaveBeenCalledExactlyOnceWith({ hubNotifications: { ...defaultHubNotificationPreferences(), 'backup-failed': true } });
    expect(stored()['backup-failed']).toBe(true);
    expect(stored()['security-alert']).toBe(false);
    expect(box(el, 'backup-failed').checked).toBe(true);
  });

  it('puts the box back and shows the error when saving fails', async () => {
    const { fixture, el, set } = mount();
    set.mockResolvedValueOnce({ ok: false, error: 'disk full' } as never);
    box(el, 'tls-renewed').click();
    await settle(fixture);
    expect(box(el, 'tls-renewed').checked).toBe(false);
    expect(el.querySelector('[data-testid="os-notify-error"]')?.textContent).toContain('disk full');
  });

  it('reports the grant from this device row once the owner is signed in', async () => {
    const granted = mount({ signedIn: true, self: { notificationsAccess: true } });
    await settle(granted.fixture);
    expect(status(granted.el)).toContain('has the notification grant');
    TestBed.resetTestingModule();
    const none = mount({ signedIn: true });
    await settle(none.fixture);
    expect(status(none.el)).toContain('does not have the notification grant');
    expect(none.port.listDevices).toHaveBeenCalledOnce();
  });

  it('without an owner session says it is unknown, or not granted when notifications are refused', async () => {
    const unknown = mount();
    await settle(unknown.fixture);
    expect(status(unknown.el)).toContain('Sign in as the owner to see');
    expect(unknown.port.listDevices).not.toHaveBeenCalled();
    TestBed.resetTestingModule();
    const denied = mount({ denied: true });
    await settle(denied.fixture);
    expect(status(denied.el)).toContain('does not have the notification grant');
  });
});
