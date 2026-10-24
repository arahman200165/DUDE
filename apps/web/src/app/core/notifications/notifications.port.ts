import { InjectionToken, inject } from '@angular/core';
import type { HubNotificationsResponse, NotificationEventData } from '@dude/contracts/hub';
import { HUB_ADMIN } from '../hub/hub-admin.token';
import type { HubAdminPort } from '../hub/hub-admin.port';
import { PlatformService } from '../platform/platform.service';

/** The Agent's code when this desktop has neither an owner session nor the Hub's notification grant (PD-110). */
export const NOTIFICATIONS_UNAVAILABLE_CODE = 'notifications-unavailable';

/**
 * The Hub's notifications as the shell bell sees them (PD-109, PD-111). Methods reject with whatever the host produced (a `HubAdminError`: its
 * `code` tells an access refusal from a failure). Nothing here fires on hosts without a Hub link.
 */
export interface HubNotificationsPort {
  /** Whether this environment exposes notifications now: Hub web always, a desktop only while it is enrolled in a Hub. */
  isAvailable(): Promise<boolean>;
  /** The answer to `isAvailable` changed (a desktop enrolled or left its Hub). Returns the unsubscribe function. */
  onAvailabilityChanged?(callback: (available: boolean) => void): () => void;
  /** Notifications newest first (dismissed ones are not listed), with the unread total. */
  list(): Promise<HubNotificationsResponse>;
  markRead(target: 'all' | readonly string[]): Promise<void>;
  dismiss(id: string): Promise<void>;
  /** A notification was created (id, kind, severity, title: no body). Returns the unsubscribe function. */
  onNotification(callback: (notification: NotificationEventData) => void): () => void;
  /** The user clicked an OS notification (desktop main raised it): the bell panel should open. Returns the unsubscribe function. */
  onOpenRequested?(callback: () => void): () => void;
}

const noop = (): void => undefined;

/** Hub-served web: the owner's cookie session reaches the Hub's own origin; the realtime link feeds `onNotification`. */
export function createHubWebNotifications(admin: HubAdminPort): HubNotificationsPort {
  return {
    isAvailable: async () => true,
    list: () => admin.listNotifications(),
    markRead: async (target) => {
      await admin.markNotificationsRead(target === 'all' ? { all: true } : { ids: [...target] });
    },
    dismiss: async (id) => {
      await admin.dismissNotification(id);
    },
    onNotification: (callback) => admin.onNotification?.(callback) ?? noop,
  };
}

/**
 * Desktop: the Device Agent reads them with the owner's session when the owner is signed in on this desktop, else with this device's grant
 * (PD-110). Available only while the desktop is enrolled in a Hub; an enrolled desktop with neither credential gets `notifications-unavailable`.
 */
export function createDesktopNotifications(admin: HubAdminPort): HubNotificationsPort {
  return {
    isAvailable: async () => {
      try {
        return (await admin.status()).enrollmentState === 'enrolled';
      } catch {
        return false;
      }
    },
    onAvailabilityChanged: (callback) => admin.onStatusChanged?.((status) => callback(status.enrollmentState === 'enrolled')) ?? noop,
    list: () => admin.listNotifications(),
    markRead: async (target) => {
      await admin.markNotificationsRead(target === 'all' ? { all: true } : { ids: [...target] });
    },
    dismiss: async (id) => {
      await admin.dismissNotification(id);
    },
    onNotification: (callback) => admin.onNotification?.(callback) ?? noop,
    onOpenRequested: (callback) => admin.onOpenNotifications?.(callback) ?? noop,
  };
}

/** Notifications for the current host: the Hub web page, the desktop's Agent, or null (Pages build, standalone web). */
export const HUB_NOTIFICATIONS = new InjectionToken<HubNotificationsPort | null>('DUDE Hub notifications', {
  providedIn: 'root',
  factory: () => {
    switch (inject(PlatformService).hostKind) {
      case 'hub-web':
        return createHubWebNotifications(inject(HUB_ADMIN));
      case 'desktop':
        return createDesktopNotifications(inject(HUB_ADMIN));
      default:
        return null;
    }
  },
});
