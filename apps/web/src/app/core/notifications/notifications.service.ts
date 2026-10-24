import { DestroyRef, Injectable, computed, inject, signal } from '@angular/core';
import type { HubNotification, NotificationEventData } from '@dude/contracts/hub';
import { HUB_EVENTS } from '../hub-events/hub-events.port';
import { HUB_REFETCH_DEBOUNCE_MS } from '../hub-events/refetch-on-hub-change';
import { HUB_NOTIFICATIONS, NOTIFICATIONS_UNAVAILABLE_CODE } from './notifications.port';

/** Codes that mean "this principal may not read notifications" (a desktop with no owner session and no grant, a Hub web session that lapsed), not a failure. */
const DENIED_CODES: ReadonlySet<string> = new Set([NOTIFICATIONS_UNAVAILABLE_CODE, 'forbidden', 'unauthorized', 'hub-forbidden', 'hub-unauthorized']);

export const NOTIFICATIONS_DENIED_MESSAGE = 'Notifications are not available here. Sign in as the Hub owner, or ask the owner to grant this device notification access.';

const SEVERITY_LABEL: Readonly<Record<NotificationEventData['severity'], string>> = { info: 'Info', warning: 'Warning', error: 'Error' };

/** What a screen reader hears for a new arrival. */
export const announcementFor = (notification: Pick<NotificationEventData, 'severity' | 'title'>): string => `${SEVERITY_LABEL[notification.severity]} notification: ${notification.title}`;

/**
 * The Hub's notifications for the shell bell (PD-109, PD-111). Holds `items` (newest first), `unread`, and the state the panel needs
 * (`available`, `loading`, `denied`, `error`). Nothing is read until this host exposes notifications (Hub web, an enrolled desktop); then it loads
 * once, so the badge is right, and after that only reloads quietly when the Hub says the list changed (`owner-view-changed` topic `notifications`)
 * or sends a `notification` event (the badge ticks up at once, then the list reloads). A burst collapses into one reload. On Pages and standalone the
 * port is null and every signal stays empty.
 */
@Injectable({ providedIn: 'root' })
export class NotificationsService {
  private readonly port = inject(HUB_NOTIFICATIONS);
  private readonly events = inject(HUB_EVENTS);

  private readonly itemsState = signal<readonly HubNotification[]>([]);
  private readonly unreadState = signal(0);
  private readonly availableState = signal(false);
  private readonly loadingState = signal(false);
  private readonly deniedState = signal(false);
  private readonly errorState = signal<string | null>(null);
  private readonly announcementState = signal('');

  readonly items = this.itemsState.asReadonly();
  readonly unread = this.unreadState.asReadonly();
  /** Whether the bell shows at all. */
  readonly available = this.availableState.asReadonly();
  /** True only while the first load is running (later reloads are quiet). */
  readonly loading = this.loadingState.asReadonly();
  /** This principal may not read notifications: the panel explains how to get access instead of showing an error. */
  readonly denied = this.deniedState.asReadonly();
  readonly error = this.errorState.asReadonly();
  /** The latest arrival, worded for an `aria-live` region. */
  readonly announcement = this.announcementState.asReadonly();
  readonly hasUnread = computed(() => this.unreadState() > 0);

  private loaded = false;
  private inFlight: Promise<void> | null = null;
  private again = false;
  private timer: ReturnType<typeof setTimeout> | null = null;

  constructor() {
    const port = this.port;
    if (port === null) return;
    const offTopic = this.events.subscribe(['notifications'], () => this.schedule());
    const offArrival = port.onNotification((notification) => this.arrived(notification));
    const offAvailability = port.onAvailabilityChanged?.((available) => this.setAvailable(available)) ?? (() => undefined);
    inject(DestroyRef).onDestroy(() => {
      offTopic();
      offArrival();
      offAvailability();
      if (this.timer !== null) clearTimeout(this.timer);
      this.timer = null;
    });
    void port.isAvailable().then((available) => this.setAvailable(available), () => this.setAvailable(false));
  }

  /** Loads the list once (the first load); a later call only reloads when nothing has loaded yet. */
  ensureLoaded(): Promise<void> {
    return this.loaded ? Promise.resolve() : this.refresh();
  }

  /** Reloads the list now. Concurrent calls fold into one follow-up reload. */
  refresh(): Promise<void> {
    const port = this.port;
    if (port === null || !this.availableState()) return Promise.resolve();
    if (this.inFlight !== null) {
      this.again = true;
      return this.inFlight;
    }
    const run = (async (): Promise<void> => {
      if (!this.loaded) this.loadingState.set(true);
      try {
        do {
          this.again = false;
          try {
            const response = await port.list();
            this.itemsState.set(response.notifications);
            this.unreadState.set(response.unread);
            this.deniedState.set(false);
            this.errorState.set(null);
            this.loaded = true;
          } catch (error) {
            this.fail(error);
            break;
          }
        } while (this.again);
      } finally {
        this.loadingState.set(false);
        this.inFlight = null;
      }
    })();
    this.inFlight = run;
    return run;
  }

  /** Marks the listed notifications (or all) read, then reloads for the Hub's truth. */
  async markRead(target: 'all' | readonly string[]): Promise<void> {
    const port = this.port;
    if (port === null) return;
    try {
      await port.markRead(target);
    } catch (error) {
      this.fail(error);
      return;
    }
    const ids = target === 'all' ? null : new Set(target);
    const now = new Date().toISOString();
    let marked = 0;
    this.itemsState.update((items) => items.map((item) => {
      if (item.readAt !== null || (ids !== null && !ids.has(item.id))) return item;
      marked++;
      return { ...item, readAt: now };
    }));
    this.unreadState.update((unread) => (target === 'all' ? 0 : Math.max(0, unread - marked)));
    this.errorState.set(null);
    void this.refresh();
  }

  /** Hides one notification, then reloads for the Hub's truth. */
  async dismiss(id: string): Promise<void> {
    const port = this.port;
    if (port === null) return;
    try {
      await port.dismiss(id);
    } catch (error) {
      this.fail(error);
      return;
    }
    const gone = this.itemsState().find((item) => item.id === id);
    this.itemsState.update((items) => items.filter((item) => item.id !== id));
    if (gone !== undefined && gone.readAt === null) this.unreadState.update((unread) => Math.max(0, unread - 1));
    this.errorState.set(null);
    void this.refresh();
  }

  private setAvailable(available: boolean): void {
    if (this.availableState() === available) return;
    this.availableState.set(available);
    if (available) {
      void this.refresh();
      return;
    }
    this.loaded = false;
    this.itemsState.set([]);
    this.unreadState.set(0);
    this.deniedState.set(false);
    this.errorState.set(null);
  }

  private arrived(notification: NotificationEventData): void {
    if (!this.availableState()) return;
    this.unreadState.update((unread) => unread + 1);
    this.announcementState.set(announcementFor(notification));
    this.schedule();
  }

  /** Debounced quiet reload: a burst of events becomes one request. */
  private schedule(): void {
    if (this.timer !== null) clearTimeout(this.timer);
    this.timer = setTimeout(() => {
      this.timer = null;
      void this.refresh();
    }, HUB_REFETCH_DEBOUNCE_MS);
  }

  private fail(error: unknown): void {
    const code = (error as { code?: unknown } | null)?.code;
    if (typeof code === 'string' && DENIED_CODES.has(code)) {
      this.deniedState.set(true);
      this.errorState.set(null);
      this.itemsState.set([]);
      this.unreadState.set(0);
      return;
    }
    this.errorState.set(error instanceof Error && error.message ? error.message : 'The notifications could not be loaded.');
  }
}
