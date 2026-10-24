import { HUB_NOTIFICATION_KINDS, HUB_NOTIFICATION_SEVERITIES, HUB_NOTIFICATION_TITLE_MAX } from './notifications.schema.js';
import type { HubNotificationKind, NotificationEventData } from './notifications.schema.js';

/**
 * Re-validates a `notification` realtime payload where it crosses a trust boundary (the Hub web page, desktop main) without the wire schemas'
 * runtime: a known kind and severity, a bounded id and title. The result is rebuilt field by field, so nothing else rides along. Null when malformed.
 */
export function parseNotificationEvent(value: unknown): NotificationEventData | null {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return null;
  const { id, kind, severity, title } = value as Record<string, unknown>;
  if (typeof id !== 'string' || id.length < 1 || id.length > 64) return null;
  if (typeof title !== 'string' || title.length > HUB_NOTIFICATION_TITLE_MAX) return null;
  if (!(HUB_NOTIFICATION_KINDS as readonly unknown[]).includes(kind) || !(HUB_NOTIFICATION_SEVERITIES as readonly unknown[]).includes(severity)) return null;
  return { id, kind, severity, title } as NotificationEventData;
}

/** Which Hub notification kinds this desktop raises an OS notification for (PD-110): device-local, never synced, every kind off until the user opts in. */
export type HubNotificationPreferences = Readonly<Record<HubNotificationKind, boolean>>;

export function defaultHubNotificationPreferences(): HubNotificationPreferences {
  return Object.fromEntries(HUB_NOTIFICATION_KINDS.map((kind) => [kind, false])) as HubNotificationPreferences;
}

/** Rebuilds the preference map from stored or renderer-supplied data: a known kind is on only when it is exactly `true`; anything else is off. */
export function sanitizeHubNotificationPreferences(value: unknown): HubNotificationPreferences {
  const source = typeof value === 'object' && value !== null && !Array.isArray(value) ? value as Record<string, unknown> : {};
  return Object.fromEntries(HUB_NOTIFICATION_KINDS.map((kind) => [kind, source[kind] === true])) as HubNotificationPreferences;
}
