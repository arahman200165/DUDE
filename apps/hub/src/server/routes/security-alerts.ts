import type { FastifyInstance } from 'fastify';
import type { TypeBoxTypeProvider } from '@fastify/type-provider-typebox';
import { getMeta, setMeta } from '@dude/sqlite-store';
import type { Db } from '@dude/sqlite-store';
import { ErrorEnvelope, HUB_API_PREFIX, MarkAlertsSeenRequest, OkResponse, SecurityAlertsResponse } from '@dude/contracts/hub';
import type { SecurityAlert } from '@dude/contracts/hub';
import type { createRequireOwner } from '../../auth/owner-auth.js';
import { maskAddress } from '../../security/address-privacy.js';
import { isExemptAddress } from '../../security/ip-block.js';

export const ALERT_WINDOW_MS = 30 * 24 * 3600_000;
export const ALERT_LIMIT = 50;
export const NEW_ADDRESS_WINDOW_MS = 90 * 24 * 3600_000;
const SEEN_KEY = 'alerts_seen_seq';

/** The fixed set of audit events that count as security alerts (`owner.sign-in` only when it came from a new address). */
export const SECURITY_ALERT_EVENTS = [
  'owner.sign-in', 'throttle.locked', 'security.ip-blocked', 'owner.password-changed', 'owner.recovery-code-used',
  'owner.recovery-codes-regenerated', 'owner.reset-local', 'owner.recovery-device', 'session.revoked-all', 'device.revoked',
  'device.enrolled', 'network.mode-changed', 'network.exposure-mode-changed', 'network.address-changed', 'tls.rotation-activated',
] as const;

const SUMMARIES: Record<string, string> = {
  'owner.sign-in': 'Signed in from a new address.',
  'security.ip-blocked': 'An address was blocked after repeated failed attempts.',
  'owner.password-changed': 'The owner password was changed.',
  'owner.recovery-code-used': 'A recovery code was used.',
  'owner.recovery-codes-regenerated': 'Recovery codes were regenerated.',
  'owner.reset-local': 'The owner was reset from the Hub computer.',
  'owner.recovery-device': 'The owner password was recovered with an enrolled device.',
  'session.revoked-all': 'All other sessions were signed out.',
  'device.revoked': 'A device was revoked.',
  'device.enrolled': 'A device was enrolled.',
  'network.mode-changed': 'The network mode was changed.',
  'network.exposure-mode-changed': 'The exposure mode was changed.',
  'tls.rotation-activated': 'The Hub certificate was rotated.',
  'network.address-changed': "This Hub's network addresses changed.",
};

function summarize(event: string, detail: unknown): string {
  if (event === 'throttle.locked') {
    const d = (detail ?? {}) as { kind?: unknown; scope?: unknown };
    const kind = typeof d.kind === 'string' ? d.kind.replace('-', ' ') : 'credential';
    return d.scope === 'global' ? `Too many failed ${kind} attempts; further attempts are temporarily locked for everyone.` : `Too many failed ${kind} attempts from one address; it is temporarily locked.`;
  }
  if (event === 'network.address-changed') {
    const d = (detail ?? {}) as { added?: unknown; removed?: unknown };
    const count = (v: unknown): number => (Array.isArray(v) ? v.length : 0);
    return `${SUMMARIES[event]} ${count(d.added)} added, ${count(d.removed)} removed.`;
  }
  return SUMMARIES[event] ?? event;
}

export function getSeenSeq(db: Db): number {
  const n = Number(getMeta(db, SEEN_KEY) ?? 0);
  return Number.isSafeInteger(n) && n >= 0 ? n : 0;
}

interface Row { seq: number; at: string; event: string; outcome: string; ip: string | null; detail_json: string | null }

export function readSecurityAlerts(db: Db, now: number): { alerts: SecurityAlert[]; unseen: number; seenSeq: number } {
  const seenSeq = getSeenSeq(db);
  const marks = SECURITY_ALERT_EVENTS.map(() => '?').join(', ');
  const rows = db.prepare(
    `SELECT seq, at, event, outcome, ip, detail_json FROM audit_events
     WHERE at >= ? AND event IN (${marks}) AND (event != 'owner.sign-in' OR json_extract(detail_json, '$.newAddress') = 1)
     ORDER BY seq DESC LIMIT ?`,
  ).all(new Date(now - ALERT_WINDOW_MS).toISOString(), ...SECURITY_ALERT_EVENTS, ALERT_LIMIT) as unknown as Row[];
  const alerts = rows.map((r): SecurityAlert => ({
    seq: r.seq, at: r.at, event: r.event, outcome: r.outcome, ip: r.ip,
    summary: summarize(r.event, r.detail_json === null ? null : (JSON.parse(r.detail_json) as unknown)),
  }));
  return { alerts, unseen: alerts.filter((a) => a.seq > seenSeq).length, seenSeq };
}

export interface SecurityAlertRouteOptions { db: Db; now: () => number; requireOwner: ReturnType<typeof createRequireOwner> }

/** Credential type: owner cookie or bearer session. Read model over the audit log; marking seen is a per-Hub meta value, not audited. */
export function registerSecurityAlertRoutes(app: FastifyInstance, options: SecurityAlertRouteOptions): void {
  const { db, now } = options;
  const typed = app.withTypeProvider<TypeBoxTypeProvider>();
  typed.get(
    `${HUB_API_PREFIX}/security/alerts`,
    { preHandler: options.requireOwner, schema: { response: { 200: SecurityAlertsResponse, 401: ErrorEnvelope, 403: ErrorEnvelope } } },
    async (_request, reply) => {
      void reply.header('Cache-Control', 'no-store');
      return reply.code(200).send(readSecurityAlerts(db, now()));
    },
  );
  typed.post(
    `${HUB_API_PREFIX}/security/alerts/seen`,
    { preHandler: options.requireOwner, schema: { body: MarkAlertsSeenRequest, response: { 200: OkResponse, 400: ErrorEnvelope, 401: ErrorEnvelope, 403: ErrorEnvelope } } },
    async (request, reply) => {
      void reply.header('Cache-Control', 'no-store');
      setMeta(db, SEEN_KEY, String(Math.max(getSeenSeq(db), request.body.upToSeq)));
      return reply.code(200).send({ ok: true });
    },
  );
}

/** True when no earlier successful sign-in was stored with the same address in the last 90 days; loopback and unknown never count. */
export function isNewSignInAddress(db: Db, ip: string | undefined, now: number): boolean {
  const storedIp = maskAddress(db, ip);
  if (isExemptAddress(ip) || storedIp === undefined) return false;
  const row = db.prepare("SELECT 1 AS hit FROM audit_events WHERE event = 'owner.sign-in' AND outcome = 'success' AND ip = ? AND at >= ? LIMIT 1")
    .get(storedIp, new Date(now - NEW_ADDRESS_WINDOW_MS).toISOString());
  return row === undefined;
}
