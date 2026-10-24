import type { OwnerViewTopic } from '@dude/contracts/hub';
import type { AuditNotice } from '../security/audit.js';
import { SECURITY_ALERT_EVENTS } from '../server/routes/security-alerts.js';

const ALERT_EVENTS: ReadonlySet<string> = new Set(SECURITY_ALERT_EVENTS);

/** Which owner views an audit row makes stale (PD-113). Only the topic leaves the Hub, never the row. */
export function ownerViewTopicsForAudit(notice: AuditNotice): OwnerViewTopic[] {
  const topics = new Set<OwnerViewTopic>();
  const domain = notice.event.slice(0, notice.event.indexOf('.'));
  if (domain === 'device') topics.add('devices');
  if (domain === 'sync' || domain === 'web') topics.add('sync');
  if (domain === 'backup') topics.add('backup');
  if (domain === 'network' || domain === 'tls' || domain === 'security') topics.add('diagnostics');
  const newSignIn = notice.event !== 'owner.sign-in' || notice.detail?.['newAddress'] === true;
  if (ALERT_EVENTS.has(notice.event) && newSignIn) topics.add('alerts');
  return [...topics];
}
