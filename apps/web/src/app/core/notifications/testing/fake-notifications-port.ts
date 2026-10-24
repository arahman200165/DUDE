import { vi } from 'vitest';
import type { HubNotification, HubNotificationsResponse, NotificationEventData } from '@dude/contracts/hub';
import type { HubNotificationsPort } from '../notifications.port';

export const notification = (id: string, overrides: Partial<HubNotification> = {}): HubNotification => ({
  id, createdAt: '2026-10-24T01:00:00.000Z', kind: 'backup-failed', severity: 'error', title: `Title ${id}`, body: `Body ${id}`, readAt: null, dismissedAt: null, ...overrides,
});

export const listing = (...items: HubNotification[]): HubNotificationsResponse => ({ notifications: items, unread: items.filter((n) => n.readAt === null).length });

/** A scriptable `HubNotificationsPort`: every method is a vi.fn, and tests push arrivals and availability changes through `emit`. */
export function createFakeNotificationsPort(initial: HubNotificationsResponse = listing(), available = true) {
  const arrivals = new Set<(n: NotificationEventData) => void>();
  const availability = new Set<(available: boolean) => void>();
  const openRequests = new Set<() => void>();
  const port = {
    isAvailable: vi.fn(async () => available),
    onAvailabilityChanged: vi.fn((cb: (available: boolean) => void) => { availability.add(cb); return () => { availability.delete(cb); }; }),
    list: vi.fn(async () => initial),
    markRead: vi.fn(async (_target: 'all' | readonly string[]) => undefined),
    dismiss: vi.fn(async (_id: string) => undefined),
    onNotification: vi.fn((cb: (n: NotificationEventData) => void) => { arrivals.add(cb); return () => { arrivals.delete(cb); }; }),
    onOpenRequested: vi.fn((cb: () => void) => { openRequests.add(cb); return () => { openRequests.delete(cb); }; }),
  };
  return {
    port: port as unknown as HubNotificationsPort & typeof port,
    arrive: (n: NotificationEventData) => arrivals.forEach((cb) => cb(n)),
    setAvailable: (value: boolean) => availability.forEach((cb) => cb(value)),
    requestOpen: () => openRequests.forEach((cb) => cb()),
    arrivalListeners: () => arrivals.size,
  };
}
