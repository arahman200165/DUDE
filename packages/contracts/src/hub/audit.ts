/**
 * Closed list of Hub audit events (PD-033). Detail payloads never carry credentials; see the Hub sanitizer.
 * Intentionally never written: `purge.previewed` and `purge.applied` (a purge deletes the database the event would live in),
 * `device.token-issued` (a token is issued every ~15 minutes per device and would drown the log) and `sync.state-reported`
 * (a routine device report with no security meaning).
 */
export const HUB_AUDIT_EVENTS = [
  'hub.started', 'hub.bootstrap',
  'owner.sign-in', 'owner.sign-out', 'owner.password-changed', 'owner.recovery-code-used',
  'owner.recovery-codes-regenerated', 'owner.reset-local', 'owner.recovery-device',
  'owner.step-up', 'session.revoked', 'session.revoked-all', 'session.rotated',
  'pairing.created', 'device.enrolled', 'device.renamed', 'device.revoked', 'device.unenrolled',
  'device.recovery-trust-changed', 'device.token-issued',
  'auth.failure',
  'tls.rotation-staged', 'tls.rotation-activated', 'tls.names-changed', 'tls.ca-created', 'tls.renewed',
  'tls.import-staged', 'tls.acme-issued', 'tls.acme-failed', 'tls.proxy-pin-staged', 'tls.proxy-pin-activated', 'tls.proxy-pin-removed',
  'network.mode-changed', 'network.proxy-changed', 'network.exposure-mode-changed', 'throttle.locked', 'security.ip-blocked', 'security.ip-unblocked', 'security.audit-ips-changed', 'purge.previewed', 'purge.applied',
  'sync.pushed', 'sync.snapshot', 'sync.state-reported', 'sync.compacted',
  'sync.environment-clear-previewed', 'sync.environment-cleared',
  'web.attached', 'web.access-changed',
  'hub.diagnostics-viewed',
] as const;
export type HubAuditEvent = (typeof HUB_AUDIT_EVENTS)[number];

export const HUB_AUDIT_ACTOR_KINDS = ['owner', 'device', 'system', 'cli', 'anonymous'] as const;
export type HubAuditActorKind = (typeof HUB_AUDIT_ACTOR_KINDS)[number];

export const HUB_AUDIT_OUTCOMES = ['success', 'failure', 'denied'] as const;
export type HubAuditOutcome = (typeof HUB_AUDIT_OUTCOMES)[number];

export function isHubAuditEvent(value: string): value is HubAuditEvent {
  return (HUB_AUDIT_EVENTS as readonly string[]).includes(value);
}
