import { provideZonelessChangeDetection } from '@angular/core';
import { TestBed, type ComponentFixture } from '@angular/core/testing';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { HUB_EVENTS, HubEventsFeed } from '../../core/hub-events/hub-events.port';
import { HUB_NOTIFICATIONS } from '../../core/notifications/notifications.port';
import type { HubNotificationsPort } from '../../core/notifications/notifications.port';
import { createFakeNotificationsPort, listing, notification } from '../../core/notifications/testing/fake-notifications-port';
import { NotificationsBell } from './notifications-bell';

const tick = async (fixture: ComponentFixture<NotificationsBell>): Promise<void> => {
  await vi.advanceTimersByTimeAsync(0);
  fixture.detectChanges();
  await vi.advanceTimersByTimeAsync(0);
  fixture.detectChanges();
};

async function mount(port: HubNotificationsPort | null) {
  TestBed.configureTestingModule({
    providers: [provideZonelessChangeDetection(), { provide: HUB_NOTIFICATIONS, useValue: port }, { provide: HUB_EVENTS, useExisting: HubEventsFeed }],
  });
  const fixture = TestBed.createComponent(NotificationsBell);
  document.body.appendChild(fixture.nativeElement);
  fixture.detectChanges();
  await tick(fixture);
  const el = fixture.nativeElement as HTMLElement;
  const q = <T extends HTMLElement = HTMLElement>(testId: string): T | null => el.querySelector<T>(`[data-testid="${testId}"]`);
  return { fixture, el, q };
}

const click = async (fixture: ComponentFixture<NotificationsBell>, target: HTMLElement | null): Promise<void> => {
  target?.click();
  fixture.detectChanges();
  await tick(fixture);
};

describe('NotificationsBell (shell exception #14)', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => {
    vi.useRealTimers();
    document.body.replaceChildren();
  });

  it('renders nothing on hosts without notifications (Pages, standalone)', async () => {
    const { q, el } = await mount(null);
    expect(q('notifications-bell')).toBeNull();
    expect(el.textContent?.trim()).toBe('');
  });

  it('renders nothing while the port says this environment exposes no notifications (a desktop not enrolled)', async () => {
    const { q } = await mount(createFakeNotificationsPort(listing(notification('n1')), false).port);
    expect(q('notifications-bell')).toBeNull();
  });

  it('shows the unread count in a badge and in the accessible name, and no badge at zero', async () => {
    const { q } = await mount(createFakeNotificationsPort(listing(notification('n1'), notification('n2'), notification('n3', { readAt: '2026-10-24T02:00:00.000Z' }))).port);
    expect(q('notifications-bell')?.getAttribute('aria-label')).toBe('Notifications, 2 unread');
    expect(q('notifications-badge')?.textContent?.trim()).toBe('2');
    expect(q('notifications-badge')?.getAttribute('aria-hidden')).toBe('true');
    TestBed.resetTestingModule();
    const empty = await mount(createFakeNotificationsPort(listing()).port);
    expect(empty.q('notifications-bell')?.getAttribute('aria-label')).toBe('Notifications');
    expect(empty.q('notifications-badge')).toBeNull();
  });

  it('caps a large count at 99+', async () => {
    const many = Array.from({ length: 120 }, (_, i) => notification(`n${i}`));
    const { q } = await mount(createFakeNotificationsPort({ notifications: many.slice(0, 5), unread: 120 }).port);
    expect(q('notifications-badge')?.textContent?.trim()).toBe('99+');
    expect(q('notifications-bell')?.getAttribute('aria-label')).toBe('Notifications, 120 unread');
  });

  it('opens a labelled dialog listing newest first with severity text, title, body and age, without marking anything read', async () => {
    const fake = createFakeNotificationsPort(listing(
      notification('n2', { severity: 'warning', title: 'Certificate renewal failed', body: 'The Hub keeps its current certificate.' }),
      notification('n1', { severity: 'info', title: 'Backup recovered', readAt: '2026-10-24T02:00:00.000Z' }),
    ));
    const { fixture, q, el } = await mount(fake.port);
    const bell = q<HTMLButtonElement>('notifications-bell')!;
    expect(bell.getAttribute('aria-expanded')).toBe('false');
    await click(fixture, bell);
    const panel = q('notifications-panel')!;
    expect(panel.getAttribute('role')).toBe('dialog');
    expect(panel.getAttribute('aria-label')).toBe('Notifications');
    expect(bell.getAttribute('aria-expanded')).toBe('true');
    expect(bell.getAttribute('aria-controls')).toBe(panel.id);
    const items = Array.from(el.querySelectorAll('[data-testid="notification-item"]'));
    expect(items.map((item) => item.querySelector('p')?.textContent?.trim())).toEqual(['Certificate renewal failed', 'Backup recovered']);
    expect(items[0]?.textContent).toContain('Warning');
    expect(items[0]?.textContent).toContain('The Hub keeps its current certificate.');
    expect(items[0]?.textContent).toContain('New');
    expect(items[1]?.textContent).toContain('Info');
    expect(items[1]?.textContent).not.toContain('New');
    expect(items[0]?.querySelector('time')?.getAttribute('datetime')).toBe('2026-10-24T01:00:00.000Z');
    expect(fake.port.markRead).not.toHaveBeenCalled();
  });

  it('moves focus into the panel when it opens, and Escape closes it and returns focus to the bell', async () => {
    const { fixture, q } = await mount(createFakeNotificationsPort(listing(notification('n1'))).port);
    const bell = q<HTMLButtonElement>('notifications-bell')!;
    await click(fixture, bell);
    const panel = q('notifications-panel')!;
    expect(panel.contains(document.activeElement)).toBe(true);
    panel.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    fixture.detectChanges();
    expect(q('notifications-panel')).toBeNull();
    expect(bell.getAttribute('aria-expanded')).toBe('false');
    expect(document.activeElement).toBe(bell);
  });

  it('keeps Tab inside the open panel, wrapping from the last control to the first and back', async () => {
    const { fixture, q } = await mount(createFakeNotificationsPort(listing(notification('n1'))).port);
    await click(fixture, q('notifications-bell'));
    const panel = q('notifications-panel')!;
    const controls = Array.from(panel.querySelectorAll<HTMLElement>('button:not([disabled])'));
    const first = controls[0]!;
    const last = controls[controls.length - 1]!;
    last.focus();
    const forward = new KeyboardEvent('keydown', { key: 'Tab', bubbles: true, cancelable: true });
    last.dispatchEvent(forward);
    expect(forward.defaultPrevented).toBe(true);
    expect(document.activeElement).toBe(first);
    const backward = new KeyboardEvent('keydown', { key: 'Tab', shiftKey: true, bubbles: true, cancelable: true });
    first.dispatchEvent(backward);
    expect(backward.defaultPrevented).toBe(true);
    expect(document.activeElement).toBe(last);
  });

  it('closes on a click outside without moving focus, and the bell toggles it', async () => {
    const { fixture, q } = await mount(createFakeNotificationsPort(listing(notification('n1'))).port);
    const bell = q<HTMLButtonElement>('notifications-bell')!;
    await click(fixture, bell);
    expect(q('notifications-panel')).not.toBeNull();
    await click(fixture, bell);
    expect(q('notifications-panel')).toBeNull();
    await click(fixture, bell);
    document.body.click();
    fixture.detectChanges();
    expect(q('notifications-panel')).toBeNull();
  });

  it('Dismiss calls the port with that notification and removes it', async () => {
    const fake = createFakeNotificationsPort(listing(notification('n1'), notification('n2')));
    const { fixture, q, el } = await mount(fake.port);
    await click(fixture, q('notifications-bell'));
    fake.port.list.mockResolvedValue(listing(notification('n2')));
    const dismiss = el.querySelectorAll<HTMLButtonElement>('[data-testid="notification-dismiss"]')[0]!;
    expect(dismiss.getAttribute('aria-label')).toBe('Dismiss Title n1');
    await click(fixture, dismiss);
    expect(fake.port.dismiss).toHaveBeenCalledExactlyOnceWith('n1');
    expect(el.querySelectorAll('[data-testid="notification-item"]')).toHaveLength(1);
    expect(q('notifications-bell')?.getAttribute('aria-label')).toBe('Notifications, 1 unread');
  });

  it('Mark all read calls the port once, clears the badge and disables itself', async () => {
    const fake = createFakeNotificationsPort(listing(notification('n1'), notification('n2')));
    const { fixture, q } = await mount(fake.port);
    await click(fixture, q('notifications-bell'));
    const markAll = q<HTMLButtonElement>('notifications-mark-all')!;
    expect(markAll.disabled).toBe(false);
    fake.port.list.mockResolvedValue(listing(notification('n1', { readAt: 'x' }), notification('n2', { readAt: 'x' })));
    await click(fixture, markAll);
    expect(fake.port.markRead).toHaveBeenCalledExactlyOnceWith('all');
    expect(q('notifications-badge')).toBeNull();
    expect(q<HTMLButtonElement>('notifications-mark-all')?.disabled).toBe(true);
  });

  it('shows the empty state, the denied explanation and a retryable error', async () => {
    const empty = await mount(createFakeNotificationsPort(listing()).port);
    await click(empty.fixture, empty.q('notifications-bell'));
    expect(empty.q('notifications-empty')).not.toBeNull();
    TestBed.resetTestingModule();
    document.body.replaceChildren();

    const denied = createFakeNotificationsPort(listing());
    denied.port.list.mockRejectedValue(Object.assign(new Error('x'), { code: 'notifications-unavailable' }));
    const d = await mount(denied.port);
    await click(d.fixture, d.q('notifications-bell'));
    expect(d.q('notifications-denied')?.textContent).toContain('grant this device notification access');
    expect(d.q('notifications-error')).toBeNull();
    expect(d.q<HTMLButtonElement>('notifications-mark-all')?.disabled).toBe(true);
    TestBed.resetTestingModule();
    document.body.replaceChildren();

    const broken = createFakeNotificationsPort(listing());
    broken.port.list.mockRejectedValue(Object.assign(new Error('The Hub could not be reached.'), { code: 'network' }));
    const e = await mount(broken.port);
    await click(e.fixture, e.q('notifications-bell'));
    expect(e.q('notifications-error')?.textContent).toContain('The Hub could not be reached.');
    expect(e.q('notifications-error')?.getAttribute('role')).toBe('alert');
    broken.port.list.mockResolvedValue(listing());
    await click(e.fixture, e.q('notifications-error')?.querySelector('button') ?? null);
    expect(e.q('notifications-error')).toBeNull();
    expect(e.q('notifications-empty')).not.toBeNull();
  });

  it('announces a new arrival politely and ticks the badge up', async () => {
    const fake = createFakeNotificationsPort(listing());
    const { fixture, q } = await mount(fake.port);
    const live = q('notifications-live')!;
    expect(live.getAttribute('aria-live')).toBe('polite');
    expect(live.textContent?.trim()).toBe('');
    fake.arrive({ id: 'n9', kind: 'backup-failed', severity: 'error', title: 'Backup failed' });
    fixture.detectChanges();
    expect(live.textContent?.trim()).toBe('Error notification: Backup failed');
    expect(q('notifications-badge')?.textContent?.trim()).toBe('1');
  });
});
