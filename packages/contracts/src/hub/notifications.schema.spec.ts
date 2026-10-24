import { describe, expect, it } from 'vitest';
import { Value } from 'typebox/value';
import { HUB_AUDIT_EVENTS } from './audit.js';
import { DeviceInfo } from './devices.schema.js';
import {
  HUB_NOTIFICATIONS_PATH, HUB_NOTIFICATION_BODY_MAX, HUB_NOTIFICATION_KINDS, HUB_NOTIFICATION_MARK_MAX, HUB_NOTIFICATION_SEVERITIES, HubNotification, HubNotificationsQuery,
  HubNotificationsResponse, MarkNotificationsReadRequest, NotificationsAccessRequest,
} from './notifications.schema.js';
import { OWNER_VIEW_TOPICS } from './owner-view-topics.js';
import { REALTIME_DEPTH_EVENTS, RealtimeEventData, realtimeEventAllowed } from './realtime.schema.js';

describe('Hub notifications contract', () => {
  const unread = { id: 'n1', createdAt: '2026-10-24T10:00:00.000Z', kind: 'backup-failed', severity: 'error', title: 'A scheduled backup failed', body: 'See the backup status.', readAt: null, dismissedAt: null };

  it('names the path and closes the kind and severity lists', () => {
    expect(HUB_NOTIFICATIONS_PATH).toBe('/api/v1/notifications');
    expect([...HUB_NOTIFICATION_KINDS]).toEqual([
      'backup-failed', 'backup-recovered', 'backup-overdue', 'tls-renewed', 'tls-renewal-failed', 'sync-compaction-failed', 'address-changed', 'security-alert',
    ]);
    expect([...HUB_NOTIFICATION_SEVERITIES]).toEqual(['info', 'warning', 'error']);
  });

  it('accepts unread, read and dismissed notifications and rejects an unknown kind, severity or over-long body', () => {
    const read = { ...unread, readAt: '2026-10-24T10:01:00.000Z' };
    const dismissed = { ...read, dismissedAt: '2026-10-24T10:02:00.000Z' };
    expect(Value.Check(HubNotificationsResponse, { notifications: [unread, read, dismissed], unread: 1 })).toBe(true);
    expect(Value.Check(HubNotificationsResponse, { notifications: [], unread: 0 })).toBe(true);
    expect(Value.Check(HubNotification, { ...unread, kind: 'run-anything' })).toBe(false);
    expect(Value.Check(HubNotification, { ...unread, severity: 'fatal' })).toBe(false);
    expect(Value.Check(HubNotification, { ...unread, body: 'x'.repeat(HUB_NOTIFICATION_BODY_MAX + 1) })).toBe(false);
    expect(Value.Check(HubNotificationsResponse, { notifications: [unread], unread: -1 })).toBe(false);
  });

  it('takes the dismissed flag only as the literal true or false', () => {
    expect(Value.Check(HubNotificationsQuery, {})).toBe(true);
    expect(Value.Check(HubNotificationsQuery, { includeDismissed: 'true' })).toBe(true);
    expect(Value.Check(HubNotificationsQuery, { includeDismissed: '1' })).toBe(false);
  });

  it('marks read by a bounded id list or for all, never both and never empty', () => {
    expect(Value.Check(MarkNotificationsReadRequest, { ids: ['a', 'b'] })).toBe(true);
    expect(Value.Check(MarkNotificationsReadRequest, { all: true })).toBe(true);
    expect(Value.Check(MarkNotificationsReadRequest, { ids: [] })).toBe(false);
    expect(Value.Check(MarkNotificationsReadRequest, { ids: ['a', 'a'] })).toBe(false);
    expect(Value.Check(MarkNotificationsReadRequest, { all: false })).toBe(false);
    expect(Value.Check(MarkNotificationsReadRequest, { ids: ['a'], all: true })).toBe(false);
    expect(Value.Check(MarkNotificationsReadRequest, { ids: Array.from({ length: HUB_NOTIFICATION_MARK_MAX + 1 }, (_, i) => `n${i}`) })).toBe(false);
  });

  it('declares the access grant body, the device flag, the audit event, the view topic and the depth event', () => {
    expect(Value.Check(NotificationsAccessRequest, { enabled: true })).toBe(true);
    expect(Value.Check(NotificationsAccessRequest, { enabled: 'yes' })).toBe(false);
    expect(Value.Check(NotificationsAccessRequest, { enabled: true, extra: 1 })).toBe(false);
    expect(DeviceInfo.properties.notificationsAccess).toBeDefined();
    expect(HUB_AUDIT_EVENTS).toContain('device.notifications-access-changed');
    expect(OWNER_VIEW_TOPICS).toContain('notifications');
    expect(REALTIME_DEPTH_EVENTS).toContain('notification');
    expect(realtimeEventAllowed('notification', 2)).toBe(false);
    expect(realtimeEventAllowed('notification', 3)).toBe(true);
    expect(Value.Check(RealtimeEventData.notification, { id: 'n1', kind: 'backup-failed', severity: 'error', title: 'A scheduled backup failed' })).toBe(true);
    expect(Value.Check(RealtimeEventData.notification, { id: 'n1', kind: 'nope', severity: 'error', title: 't' })).toBe(false);
  });
});
