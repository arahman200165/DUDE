import { HUB_NOTIFICATION_KINDS, HUB_NOTIFICATION_SEVERITIES, HUB_NOTIFICATION_TITLE_MAX } from './notifications.schema.js';
import type { NotificationEventData } from './notifications.schema.js';

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
