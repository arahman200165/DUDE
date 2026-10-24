import { TestBed } from '@angular/core/testing';
import { vi } from 'vitest';
import type { HubAdminPort } from '../hub/hub-admin.port';
import { HUB_ADMIN } from '../hub/hub-admin.token';
import { PlatformService } from '../platform/platform.service';
import { HUB_NOTIFICATIONS, createDesktopNotifications, createHubWebNotifications } from './notifications.port';

function admin(overrides: Record<string, unknown> = {}) {
  const fake = {
    status: vi.fn(async () => ({ enrollmentState: 'enrolled' })),
    listNotifications: vi.fn(async () => ({ notifications: [], unread: 0 })),
    markNotificationsRead: vi.fn(async () => ({ ok: true })),
    dismissNotification: vi.fn(async () => ({ ok: true })),
    ...overrides,
  };
  return fake;
}
const asPort = (hub: object): HubAdminPort => hub as unknown as HubAdminPort;

describe('notifications port adapters (PD-111)', () => {
  it('Hub web is always available, maps mark-read targets to the contract and forwards the realtime hook', async () => {
    const off = vi.fn();
    const onNotification = vi.fn(() => off);
    const hub = admin({ onNotification });
    const port = createHubWebNotifications(asPort(hub));
    await expect(port.isAvailable()).resolves.toBe(true);
    expect(port.onAvailabilityChanged).toBeUndefined();
    await port.list();
    await port.markRead(['n1', 'n2']);
    await port.markRead('all');
    await port.dismiss('n1');
    expect(hub.markNotificationsRead.mock.calls).toEqual([[{ ids: ['n1', 'n2'] }], [{ all: true }]]);
    expect(hub.dismissNotification).toHaveBeenCalledExactlyOnceWith('n1');
    const listener = vi.fn();
    expect(port.onNotification(listener)).toBe(off);
    expect(onNotification).toHaveBeenCalledExactlyOnceWith(listener);
  });

  it('Hub web without a realtime hook still returns an unsubscribe function', () => {
    const port = createHubWebNotifications(asPort(admin()));
    expect(() => port.onNotification(() => undefined)()).not.toThrow();
  });

  it('a desktop is available only while enrolled, and follows enrollment changes', async () => {
    let onStatus: ((status: { enrollmentState: string }) => void) | null = null;
    const hub = admin({ onStatusChanged: (cb: (status: { enrollmentState: string }) => void) => { onStatus = cb; return () => undefined; } });
    const port = createDesktopNotifications(asPort(hub));
    await expect(port.isAvailable()).resolves.toBe(true);
    hub.status.mockResolvedValueOnce({ enrollmentState: 'standalone' });
    await expect(port.isAvailable()).resolves.toBe(false);
    hub.status.mockRejectedValueOnce(new Error('bridge missing'));
    await expect(port.isAvailable()).resolves.toBe(false);
    const seen: boolean[] = [];
    port.onAvailabilityChanged?.((available) => seen.push(available));
    onStatus!({ enrollmentState: 'standalone' });
    onStatus!({ enrollmentState: 'enrolled' });
    onStatus!({ enrollmentState: 'revoked' });
    expect(seen).toEqual([false, true, false]);
  });

  it('a desktop passes the Agent refusal code through so the service can show the denied state', async () => {
    const refusal = Object.assign(new Error('Notifications are not available on this device.'), { code: 'notifications-unavailable' });
    const port = createDesktopNotifications(asPort(admin({ listNotifications: async () => { throw refusal; } })));
    await expect(port.list()).rejects.toBe(refusal);
  });

  describe('HUB_NOTIFICATIONS token', () => {
    const configure = (hostKind: 'desktop' | 'hub-web' | 'web', hub: object): void => {
      TestBed.configureTestingModule({ providers: [{ provide: PlatformService, useValue: { hostKind } }, { provide: HUB_ADMIN, useValue: asPort(hub) }] });
    };

    it('is null on Pages and standalone web, and a port on Hub web and desktop', async () => {
      const hub = admin();
      configure('web', hub);
      expect(TestBed.inject(HUB_NOTIFICATIONS)).toBeNull();
      TestBed.resetTestingModule();
      configure('hub-web', hub);
      await expect(TestBed.inject(HUB_NOTIFICATIONS)?.isAvailable()).resolves.toBe(true);
      TestBed.resetTestingModule();
      configure('desktop', hub);
      hub.status.mockResolvedValueOnce({ enrollmentState: 'standalone' });
      await expect(TestBed.inject(HUB_NOTIFICATIONS)?.isAvailable()).resolves.toBe(false);
    });
  });
});
