/**
 * Owner admin views that refetch when the Hub says they changed (PD-113). The `owner-view-changed` realtime event carries the topic
 * only, never content. Dependency-free so the Device Agent protocol and the renderer can validate a topic without the wire schemas.
 */
export const OWNER_VIEW_TOPICS = ['devices', 'sync', 'backup', 'alerts', 'diagnostics', 'jobs', 'notifications'] as const;
export type OwnerViewTopic = (typeof OWNER_VIEW_TOPICS)[number];

export function isOwnerViewTopic(value: unknown): value is OwnerViewTopic {
  return typeof value === 'string' && (OWNER_VIEW_TOPICS as readonly string[]).includes(value);
}
