import { X509Certificate, createHash } from 'node:crypto';
import { transaction } from '@dude/sqlite-store';
import type { Db } from '@dude/sqlite-store';
import { audit } from '../security/audit.js';
import { ConfirmationStore } from '../security/confirmation-store.js';
import { RotationError } from './rotation.js';
import type { RotationDevice } from './rotation.js';
import { spkiSha256 } from './self-signed.js';

export const PROXY_PIN_ACTIVATE_ACTION = 'tls.proxy-pin.activate';
export const PROXY_PIN_REMOVE_ACTION = 'tls.proxy-pin.remove';
/** Consequence classes of the proxy-pin commands: both change which certificates devices accept (no filesystem or process effect). */
export const PROXY_PIN_CONSEQUENCE_CLASS = ['database-write', 'trust-change'] as const;
const BINDING = 'cli';
const SPKI = /^[A-Za-z0-9_-]{43}$/;

/** Public: active plus staged next reverse-proxy leaf pins, advertised to devices by `/hello` and the certificates route. */
export function proxyPinSpkis(db: Db): string[] {
  return (db.prepare("SELECT spki_sha256 FROM tls_proxy_pins ORDER BY CASE state WHEN 'active' THEN 0 ELSE 1 END").all() as unknown as Array<{ spki_sha256: string }>).map((r) => r.spki_sha256);
}

/** A raw base64url SPKI pin, or the SPKI of the first certificate in a PEM text. Throws on anything else. */
export function resolveProxyPin(input: string): { spkiSha256: string; certPem: string | null } {
  const text = input.trim();
  if (text.includes('BEGIN CERTIFICATE')) {
    let cert: X509Certificate;
    try { cert = new X509Certificate(text); } catch { throw new RotationError('bad-request', 'The proxy certificate is not a valid PEM certificate.'); }
    return { spkiSha256: spkiSha256(cert), certPem: cert.toString() };
  }
  if (!SPKI.test(text)) throw new RotationError('bad-request', 'Provide a PEM certificate file or a base64url SHA-256 SPKI pin (43 characters).');
  return { spkiSha256: text, certPem: null };
}

interface ProxyRow { spki_sha256: string; state: 'active' | 'next'; created_at: string; activated_at: string | null }

export interface ProxyPinsOptions {
  db: Db;
  now?: () => number;
  confirmations?: ConfirmationStore;
  /** Tells connected clients about a newly staged proxy pin (same `tls-next-pin` event, marked as a proxy pin). */
  announceNext?: (spkiSha256: string) => void;
}

/** Reverse-proxy leaf pins: at most one active and one next, staged and activated like the Hub's own dual-pin rotation. */
export function createProxyPins(options: ProxyPinsOptions) {
  const { db } = options;
  const now = options.now ?? Date.now;
  const confirmations = options.confirmations ?? new ConfirmationStore();
  const row = (state: 'active' | 'next'): ProxyRow | undefined =>
    db.prepare('SELECT spki_sha256, state, created_at, activated_at FROM tls_proxy_pins WHERE state = ? LIMIT 1').get(state) as ProxyRow | undefined;

  function status() {
    const active = row('active');
    const next = row('next');
    let acked: string[] = [];
    let pending: RotationDevice[] = [];
    if (next) {
      acked = (db.prepare('SELECT device_id FROM tls_proxy_pin_acks WHERE spki_sha256 = ? ORDER BY device_id').all(next.spki_sha256) as unknown as Array<{ device_id: string }>).map((r) => r.device_id);
      pending = (db
        .prepare(
          `SELECT device_id, display_name FROM devices WHERE revoked_at IS NULL AND unenrolled_at IS NULL
           AND device_id NOT IN (SELECT device_id FROM tls_proxy_pin_acks WHERE spki_sha256 = ?) ORDER BY registered_at, device_id`,
        )
        .all(next.spki_sha256) as unknown as Array<{ device_id: string; display_name: string }>).map((r) => ({ deviceId: r.device_id, displayName: r.display_name }));
    }
    return {
      active: active ? { spkiSha256: active.spki_sha256, activatedAt: active.activated_at } : null,
      next: next ? { spkiSha256: next.spki_sha256, createdAt: next.created_at } : null,
      acked,
      pending,
    };
  }

  function add(input: string): { spkiSha256: string; state: 'next' } {
    const { spkiSha256: spki, certPem } = resolveProxyPin(input);
    if (row('next')) throw new RotationError('conflict', 'A next proxy pin is already staged. Activate it ("tls proxy-pin activate") or remove it first.');
    if (db.prepare('SELECT 1 AS x FROM tls_proxy_pins WHERE spki_sha256 = ?').get(spki) !== undefined) throw new RotationError('conflict', 'That proxy pin is already registered.');
    if (db.prepare("SELECT 1 AS x FROM tls_pins WHERE spki_sha256 = ? AND state IN ('active', 'next')").get(spki) !== undefined) {
      throw new RotationError('bad-request', "That is the Hub's own certificate pin, not a proxy pin.");
    }
    const at = new Date(now()).toISOString();
    transaction(db, () => {
      db.prepare("INSERT INTO tls_proxy_pins(spki_sha256, state, cert_pem, created_at, activated_at) VALUES(?, 'next', ?, ?, NULL)").run(spki, certPem, at);
      audit(db, { event: 'tls.proxy-pin-staged', outcome: 'success', actorKind: 'cli', detail: { spki }, now: now() });
    });
    options.announceNext?.(spki);
    return { spkiSha256: spki, state: 'next' };
  }

  const digestOf = (parts: readonly string[]): string => createHash('sha256').update(parts.join('|')).digest('hex');
  const activateDigest = (next: string, pending: readonly string[], force: boolean): string => digestOf([next, [...pending].sort().join(','), force ? 'force' : 'safe']);

  function previewActivate(input: { force?: boolean } = {}) {
    const state = status();
    if (!state.next) throw new RotationError('not-staged', 'No next proxy pin is staged. Run "dude-hub tls proxy-pin add" first.');
    const force = input.force === true;
    if (state.pending.length > 0 && !force) {
      throw new RotationError('conflict', `${state.pending.length} device(s) have not acknowledged the next proxy pin: ${state.pending.map((d) => d.displayName).join(', ')}. Wait for them to connect, or use --force.`);
    }
    const at = now();
    const confirmToken = confirmations.issue({ action: PROXY_PIN_ACTIVATE_ACTION, digest: activateDigest(state.next.spkiSha256, state.pending.map((d) => d.deviceId), force), bindingId: BINDING, now: at });
    return {
      confirmToken, expiresAt: ConfirmationStore.expiresAt(at), consequenceClass: PROXY_PIN_CONSEQUENCE_CLASS,
      summary: { activeProxySpkiSha256: state.active?.spkiSha256 ?? null, nextProxySpkiSha256: state.next.spkiSha256, force, unacknowledged: state.pending },
      consequence: state.active ? 'The current active proxy pin is replaced; devices that did not learn the new pin can no longer connect through the proxy.' : 'The staged proxy pin becomes active.',
    };
  }

  function applyActivate(input: { confirmToken: string; force?: boolean }) {
    const state = status();
    const next = state.next;
    if (!next) throw new RotationError('not-staged', 'No next proxy pin is staged.');
    const force = input.force === true;
    const result = confirmations.consumeDetailed({ token: input.confirmToken, action: PROXY_PIN_ACTIVATE_ACTION, digest: activateDigest(next.spkiSha256, state.pending.map((d) => d.deviceId), force), bindingId: BINDING, now: now() });
    if (result === 'invalid') throw new RotationError('confirmation-required', 'The confirmation is missing, expired or already used.');
    if (result === 'digest-mismatch') throw new RotationError('conflict', 'Devices or the staged proxy pin changed since the preview. Run the preview again.');
    if (state.pending.length > 0 && !force) throw new RotationError('conflict', 'Devices have not acknowledged the next proxy pin.');
    const at = new Date(now()).toISOString();
    transaction(db, () => {
      db.prepare("DELETE FROM tls_proxy_pins WHERE state = 'active'").run();
      db.prepare("UPDATE tls_proxy_pins SET state = 'active', activated_at = ? WHERE spki_sha256 = ?").run(at, next.spkiSha256);
      audit(db, { event: 'tls.proxy-pin-activated', outcome: 'success', actorKind: 'cli', detail: { spki: next.spkiSha256, forced: force }, now: now() });
    });
    return { activated: true, spkiSha256: next.spkiSha256, previousSpkiSha256: state.active?.spkiSha256 ?? null, unacknowledged: force ? state.pending : [] };
  }

  const find = (spki: string): ProxyRow => {
    const found = db.prepare('SELECT spki_sha256, state, created_at, activated_at FROM tls_proxy_pins WHERE spki_sha256 = ?').get(spki) as ProxyRow | undefined;
    if (!found) throw new RotationError('not-staged', 'That proxy pin is not registered.');
    return found;
  };
  const removeDigest = (found: ProxyRow): string => digestOf([found.spki_sha256, found.state]);

  function previewRemove(spki: string) {
    const found = find(spki);
    const devices = db.prepare('SELECT COUNT(*) AS n FROM devices WHERE revoked_at IS NULL AND unenrolled_at IS NULL').get() as { n: number };
    const at = now();
    const confirmToken = confirmations.issue({ action: PROXY_PIN_REMOVE_ACTION, digest: removeDigest(found), bindingId: BINDING, now: at });
    return {
      confirmToken, expiresAt: ConfirmationStore.expiresAt(at), consequenceClass: PROXY_PIN_CONSEQUENCE_CLASS,
      summary: { spkiSha256: found.spki_sha256, state: found.state, devices: Number(devices.n) },
      consequence: found.state === 'active'
        ? 'This is the ACTIVE proxy pin: once removed, devices can no longer connect through the proxy (they keep working directly against the Hub).'
        : 'This staged proxy pin is discarded; devices never needed it to connect.',
    };
  }

  function applyRemove(input: { spkiSha256: string; confirmToken: string }) {
    const found = find(input.spkiSha256);
    const result = confirmations.consumeDetailed({ token: input.confirmToken, action: PROXY_PIN_REMOVE_ACTION, digest: removeDigest(found), bindingId: BINDING, now: now() });
    if (result === 'invalid') throw new RotationError('confirmation-required', 'The confirmation is missing, expired or already used.');
    if (result === 'digest-mismatch') throw new RotationError('conflict', 'The proxy pin changed since the preview. Run the preview again.');
    transaction(db, () => {
      db.prepare('DELETE FROM tls_proxy_pins WHERE spki_sha256 = ?').run(found.spki_sha256);
      audit(db, { event: 'tls.proxy-pin-removed', outcome: 'success', actorKind: 'cli', detail: { spki: found.spki_sha256 }, now: now() });
    });
    return { removed: true, spkiSha256: found.spki_sha256, state: found.state };
  }

  return { status, add, previewActivate, applyActivate, previewRemove, applyRemove };
}

export type ProxyPins = ReturnType<typeof createProxyPins>;
