import Type, { type Static } from 'typebox';

/**
 * Hub notifications (PD-109, PD-110). Credential: owner cookie or bearer session, or a device token whose desktop row holds the
 * notification-reader grant (`devices.notifications_access`); the grant allows these routes and `notification` events and nothing else.
 */
export const HUB_NOTIFICATIONS_PATH = '/api/v1/notifications';

/** The closed list of notification producers' kinds; a producer is added only with its own milestone. */
export const HUB_NOTIFICATION_KINDS = [
  'backup-failed', 'backup-recovered', 'backup-overdue', 'tls-renewed', 'tls-renewal-failed', 'sync-compaction-failed', 'address-changed', 'security-alert',
] as const;
export type HubNotificationKind = (typeof HUB_NOTIFICATION_KINDS)[number];

export const HUB_NOTIFICATION_SEVERITIES = ['info', 'warning', 'error'] as const;
export type HubNotificationSeverity = (typeof HUB_NOTIFICATION_SEVERITIES)[number];

export const HUB_NOTIFICATION_TITLE_MAX = 120;
/** A short sentence or two: never a secret, a path, a stack or record content. */
export const HUB_NOTIFICATION_BODY_MAX = 300;
/** Longest `ids` list of one mark-read request. */
export const HUB_NOTIFICATION_MARK_MAX = 100;

const Kind = Type.Unsafe<HubNotificationKind>({ type: 'string', enum: [...HUB_NOTIFICATION_KINDS] });
const Severity = Type.Unsafe<HubNotificationSeverity>({ type: 'string', enum: [...HUB_NOTIFICATION_SEVERITIES] });
const NotificationId = Type.String({ minLength: 1, maxLength: 64 });
const NullableInstant = Type.Union([Type.String({ minLength: 1, maxLength: 40 }), Type.Null()]);

export const HubNotification = Type.Object({
  id: NotificationId,
  createdAt: Type.String({ minLength: 1, maxLength: 40 }),
  kind: Kind,
  severity: Severity,
  title: Type.String({ minLength: 1, maxLength: HUB_NOTIFICATION_TITLE_MAX }),
  body: Type.String({ maxLength: HUB_NOTIFICATION_BODY_MAX }),
  readAt: NullableInstant,
  dismissedAt: NullableInstant,
});
export type HubNotification = Static<typeof HubNotification>;

/** The Hub does not coerce query types: the flag arrives as `true` or `false`. */
export const HubNotificationsQuery = Type.Object({
  includeDismissed: Type.Optional(Type.Union([Type.Literal('true'), Type.Literal('false')])),
});
export type HubNotificationsQuery = Static<typeof HubNotificationsQuery>;

export const HubNotificationsResponse = Type.Object({
  /** Newest first; dismissed ones only with `?includeDismissed=true`. */
  notifications: Type.Array(HubNotification),
  /** Notifications neither read nor dismissed (all of them, not only those listed). */
  unread: Type.Integer({ minimum: 0 }),
});
export type HubNotificationsResponse = Static<typeof HubNotificationsResponse>;

/** Either the listed ids or every notification. Marking read is not audited. */
export const MarkNotificationsReadRequest = Type.Union([
  Type.Object({ ids: Type.Array(NotificationId, { minItems: 1, maxItems: HUB_NOTIFICATION_MARK_MAX, uniqueItems: true }) }, { additionalProperties: false }),
  Type.Object({ all: Type.Literal(true) }, { additionalProperties: false }),
]);
export type MarkNotificationsReadRequest = Static<typeof MarkNotificationsReadRequest>;

export const NotificationIdParams = Type.Object({ id: NotificationId });
export type NotificationIdParams = Static<typeof NotificationIdParams>;

/** `PUT /api/v1/devices/:deviceId/notifications-access` (owner with step-up): grants or revokes the notification-reader grant of a desktop row. */
export const NotificationsAccessRequest = Type.Object({ enabled: Type.Boolean() }, { additionalProperties: false });
export type NotificationsAccessRequest = Static<typeof NotificationsAccessRequest>;

/** Payload of the `notification` realtime event (protocol 3): enough for an OS notification; the body is fetched with the list route. */
export const NotificationEventData = Type.Object({ id: NotificationId, kind: Kind, severity: Severity, title: Type.String({ maxLength: HUB_NOTIFICATION_TITLE_MAX }) });
export type NotificationEventData = Static<typeof NotificationEventData>;
