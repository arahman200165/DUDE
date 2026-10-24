import { HubApiError } from '@dude/api-client';
import type { HubClient } from '@dude/api-client';
import type { HubConnectionManager } from './hub-client.js';
import { HubManagerError } from './errors.js';

/** The part of the connection manager a notification call needs. */
export type NotificationsHost = Pick<HubConnectionManager, 'owner' | 'deviceCall'>;

export const NOTIFICATIONS_UNAVAILABLE = 'notifications-unavailable';
const UNAVAILABLE_MESSAGE = 'Notifications are not available on this device. Sign in as the Hub owner, or ask the owner to grant this device notification access.';

/**
 * Runs a notification route with the credential this desktop has (PD-110): the owner's bearer when the owner is signed in here (an expired
 * session falls through to the device), otherwise this device's token, which the Hub accepts only for a desktop holding the notification-reader
 * grant. A refusal from the device path (403 without the grant, or a rejected token) is the typed `notifications-unavailable` so the page shows
 * a state to act on instead of an error. The owner path keeps its own errors (a revoked owner session is `owner-session-expired`).
 */
export async function withNotificationsCredential<T>(host: NotificationsHost, fn: (api: HubClient, token: string) => Promise<T>): Promise<T> {
  if (host.owner.status().signedIn) {
    try {
      return await host.owner.withOwner(fn);
    } catch (error) {
      if (!(error instanceof HubManagerError && error.code === 'owner-session-expired')) throw error;
    }
  }
  try {
    // A 403 here means "no grant", not "stale token": do not refresh the token or probe for revocation because of it.
    return await host.deviceCall(fn, { authRetryOn403: false });
  } catch (error) {
    if (error instanceof HubApiError && (error.status === 403 || error.status === 401)) throw new HubManagerError(NOTIFICATIONS_UNAVAILABLE, UNAVAILABLE_MESSAGE);
    throw error;
  }
}
