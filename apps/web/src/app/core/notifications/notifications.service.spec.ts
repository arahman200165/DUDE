import { provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { HubEventsFeed, HUB_EVENTS } from '../hub-events/hub-events.port';
import { HUB_REFETCH_DEBOUNCE_MS } from '../hub-events/refetch-on-hub-change';
import { createFakeNotificationsPort, listing, notification } from './testing/fake-notifications-port';
import { HUB_NOTIFICATIONS, NOTIFICATIONS_UNAVAILABLE_CODE } from './notifications.port';
import { NotificationsService } from './notifications.service';
import type { HubNotificationsPort } from './notifications.port';

const flush = async (): Promise<void> => { await vi.advanceTimersByTimeAsync(0); };
const ARRIVAL = { id: 'n9', kind: 'tls-renewal-failed', severity: 'warning', title: 'Renewal failed' } as const;

function configure(port: HubNotificationsPort | null): { feed: HubEventsFeed; service: NotificationsService } {
  TestBed.configureTestingModule({
    providers: [provideZonelessChangeDetection(), { provide: HUB_NOTIFICATIONS, useValue: port }, { provide: HUB_EVENTS, useExisting: HubEventsFeed }],
  });
  return { feed: TestBed.inject(HubEventsFeed), service: TestBed.inject(NotificationsService) };
}

describe('NotificationsService (PD-109, PD-111)', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('stays empty and subscribes to nothing when the host has no port (Pages, standalone)', async () => {
    const { feed, service } = configure(null);
    await flush();
    expect(service.available()).toBe(false);
    expect(service.items()).toEqual([]);
    expect(service.unread()).toBe(0);
    expect(feed.listening).toBe(0);
    await service.refresh();
    await service.markRead('all');
    await service.dismiss('n1');
    expect(service.items()).toEqual([]);
  });

  it('reads nothing until the host reports it exposes notifications, then loads once', async () => {
    const fake = createFakeNotificationsPort(listing(notification('n1'), notification('n2', { readAt: '2026-10-24T02:00:00.000Z' })), false);
    const { service } = configure(fake.port);
    await flush();
    expect(service.available()).toBe(false);
    expect(fake.port.list).not.toHaveBeenCalled();
    fake.setAvailable(true);
    await flush();
    expect(service.available()).toBe(true);
    expect(fake.port.list).toHaveBeenCalledTimes(1);
    expect(service.items().map((n) => n.id)).toEqual(['n1', 'n2']);
    expect(service.unread()).toBe(1);
    expect(service.loading()).toBe(false);
    await service.ensureLoaded();
    expect(fake.port.list).toHaveBeenCalledTimes(1);
  });

  it('clears everything when the environment stops exposing notifications (a desktop leaves its Hub)', async () => {
    const fake = createFakeNotificationsPort(listing(notification('n1')));
    const { service } = configure(fake.port);
    await flush();
    expect(service.unread()).toBe(1);
    fake.setAvailable(false);
    expect(service.available()).toBe(false);
    expect(service.items()).toEqual([]);
    expect(service.unread()).toBe(0);
  });

  it('reloads once after a burst of notifications topic events, quietly (no loading state)', async () => {
    const fake = createFakeNotificationsPort(listing(notification('n1')));
    const { feed, service } = configure(fake.port);
    await flush();
    expect(fake.port.list).toHaveBeenCalledTimes(1);
    fake.port.list.mockResolvedValue(listing(notification('n1'), notification('n2')));
    feed.notify('notifications');
    feed.notify('notifications');
    feed.notify('devices');
    await vi.advanceTimersByTimeAsync(HUB_REFETCH_DEBOUNCE_MS - 1);
    expect(fake.port.list).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1);
    expect(fake.port.list).toHaveBeenCalledTimes(2);
    expect(service.items().map((n) => n.id)).toEqual(['n1', 'n2']);
    expect(service.loading()).toBe(false);
  });

  it('bumps the unread count and announces a notification event at once, then reloads once for the truth', async () => {
    const fake = createFakeNotificationsPort(listing(notification('n1')));
    const { service } = configure(fake.port);
    await flush();
    expect(service.unread()).toBe(1);
    fake.port.list.mockResolvedValue(listing(notification('n9'), notification('n1')));
    fake.arrive(ARRIVAL);
    fake.arrive(ARRIVAL);
    expect(service.unread()).toBe(3);
    expect(service.announcement()).toBe('Warning notification: Renewal failed');
    await vi.advanceTimersByTimeAsync(HUB_REFETCH_DEBOUNCE_MS);
    expect(fake.port.list).toHaveBeenCalledTimes(2);
    expect(service.unread()).toBe(2);
  });

  it('ignores an arrival while the host exposes no notifications', async () => {
    const fake = createFakeNotificationsPort(listing(), false);
    const { service } = configure(fake.port);
    await flush();
    fake.arrive(ARRIVAL);
    await vi.advanceTimersByTimeAsync(HUB_REFETCH_DEBOUNCE_MS);
    expect(service.unread()).toBe(0);
    expect(fake.port.list).not.toHaveBeenCalled();
  });

  it('markRead(ids) marks only those items and lowers the count; markRead("all") clears it; both reload for the Hub truth', async () => {
    const fake = createFakeNotificationsPort(listing(notification('n1'), notification('n2'), notification('n3')));
    const { service } = configure(fake.port);
    await flush();
    const READ = '2026-10-24T02:00:00.000Z';
    fake.port.list.mockResolvedValue(listing(notification('n1', { readAt: READ }), notification('n2'), notification('n3')));
    await service.markRead(['n1']);
    expect(fake.port.markRead).toHaveBeenLastCalledWith(['n1']);
    expect(service.items().map((n) => n.readAt !== null)).toEqual([true, false, false]);
    expect(service.unread()).toBe(2);
    fake.port.list.mockResolvedValue(listing(notification('n1', { readAt: READ }), notification('n2', { readAt: READ }), notification('n3', { readAt: READ })));
    await service.markRead('all');
    expect(fake.port.markRead).toHaveBeenLastCalledWith('all');
    expect(service.unread()).toBe(0);
    expect(service.items().every((n) => n.readAt !== null)).toBe(true);
    await flush();
    expect(fake.port.list.mock.calls.length).toBeGreaterThan(1);
  });

  it('dismiss removes the item, lowers the count only for an unread one, and reloads', async () => {
    const fake = createFakeNotificationsPort(listing(notification('n1'), notification('n2', { readAt: '2026-10-24T02:00:00.000Z' })));
    const { service } = configure(fake.port);
    await flush();
    fake.port.list.mockResolvedValue(listing(notification('n1')));
    await service.dismiss('n2');
    expect(fake.port.dismiss).toHaveBeenLastCalledWith('n2');
    expect(service.items().map((n) => n.id)).toEqual(['n1']);
    expect(service.unread()).toBe(1);
    fake.port.list.mockResolvedValue(listing());
    await service.dismiss('n1');
    expect(service.items()).toEqual([]);
    expect(service.unread()).toBe(0);
    await flush();
    expect(fake.port.list.mock.calls.length).toBeGreaterThan(1);
  });

  it('a failed dismiss keeps the item and shows an error', async () => {
    const fake = createFakeNotificationsPort(listing(notification('n1')));
    const { service } = configure(fake.port);
    await flush();
    fake.port.dismiss.mockRejectedValueOnce(new Error('The Hub is busy.'));
    await service.dismiss('n1');
    expect(service.items().map((n) => n.id)).toEqual(['n1']);
    expect(service.error()).toBe('The Hub is busy.');
    expect(service.denied()).toBe(false);
  });

  it.each([NOTIFICATIONS_UNAVAILABLE_CODE, 'forbidden', 'unauthorized'])('a %s answer is the denied state, not an error', async (code) => {
    const fake = createFakeNotificationsPort(listing(notification('n1')));
    const { service } = configure(fake.port);
    await flush();
    fake.port.list.mockRejectedValueOnce(Object.assign(new Error('Notifications are not available on this device.'), { code }));
    await service.refresh();
    expect(service.denied()).toBe(true);
    expect(service.error()).toBeNull();
    expect(service.items()).toEqual([]);
    expect(service.unread()).toBe(0);
    fake.port.list.mockResolvedValueOnce(listing(notification('n1')));
    await service.refresh();
    expect(service.denied()).toBe(false);
    expect(service.unread()).toBe(1);
  });

  it('any other failure is an error that a later successful load clears', async () => {
    const fake = createFakeNotificationsPort(listing());
    fake.port.list.mockRejectedValueOnce(Object.assign(new Error('The Hub could not be reached.'), { code: 'network' }));
    const { service } = configure(fake.port);
    await flush();
    expect(service.error()).toBe('The Hub could not be reached.');
    expect(service.denied()).toBe(false);
    await service.refresh();
    expect(service.error()).toBeNull();
  });

  it('folds concurrent refreshes into one follow-up request', async () => {
    const fake = createFakeNotificationsPort(listing(notification('n1')));
    const { service } = configure(fake.port);
    await flush();
    fake.port.list.mockClear();
    let release!: () => void;
    const gate = new Promise<void>((resolve) => { release = resolve; });
    fake.port.list.mockImplementationOnce(async () => { await gate; return listing(notification('n1')); });
    const first = service.refresh();
    void service.refresh();
    void service.refresh();
    release();
    await first;
    expect(fake.port.list).toHaveBeenCalledTimes(2);
  });

  it('drops its subscriptions and a pending reload when destroyed', async () => {
    const fake = createFakeNotificationsPort(listing(notification('n1')));
    const { feed } = configure(fake.port);
    await flush();
    expect(feed.listening).toBe(1);
    feed.notify('notifications');
    TestBed.resetTestingModule();
    expect(feed.listening).toBe(0);
    expect(fake.arrivalListeners()).toBe(0);
    await vi.advanceTimersByTimeAsync(HUB_REFETCH_DEBOUNCE_MS * 2);
    expect(fake.port.list).toHaveBeenCalledTimes(1);
  });
});
