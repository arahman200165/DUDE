import { createHash } from 'node:crypto';
import { existsSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { transaction } from '@dude/sqlite-store';
import type { Db } from '@dude/sqlite-store';
import { audit } from '../security/audit.js';
import { ConfirmationStore } from '../security/confirmation-store.js';
import { generateSelfSigned, spkiSha256 } from './self-signed.js';

export const TLS_ACTIVATE_ACTION = 'tls.activate';
const BINDING = 'cli';
export const NEXT_KEY_FILE = 'next-key.pem';
export const NEXT_CERT_FILE = 'next-cert.pem';

export class RotationError extends Error {
  constructor(readonly code: 'conflict' | 'not-staged' | 'confirmation-required' | 'bad-request' | 'internal', message: string) {
    super(message);
  }
}

export interface RotationDevice { deviceId: string; displayName: string }

export interface RotationStatus {
  active: { spkiSha256: string; activatedAt: string | null } | null;
  next: { spkiSha256: string; createdAt: string } | null;
  acked: string[];
  pending: RotationDevice[];
}

export interface TlsRotationOptions {
  db: Db;
  tlsDir: string;
  hubInstanceId: string;
  now?: () => number;
  confirmations?: ConfirmationStore;
  /** Hot-swaps the serving certificate (`server.setSecureContext`). */
  applySecureContext?: (context: { key: string; cert: string; minVersion: 'TLSv1.2' }) => void;
  /** Tells connected clients about a newly staged pin. */
  announceNext?: (spkiSha256: string) => void;
}

/** Records a device acknowledgement; ignored unless `spki` is the current next pin. Returns whether a new ack was stored. */
export function acknowledgeTlsPin(db: Db, deviceId: string, spki: string, nowMs: number): boolean {
  const next = db.prepare("SELECT 1 AS x FROM tls_pins WHERE state = 'next' AND spki_sha256 = ?").get(spki);
  if (next === undefined) return false;
  const result = db.prepare('INSERT OR IGNORE INTO tls_pin_acks(spki_sha256, device_id, acked_at) VALUES(?, ?, ?)').run(spki, deviceId, new Date(nowMs).toISOString());
  return Number(result.changes) === 1;
}

interface PinRow { spki_sha256: string; created_at: string; activated_at: string | null }

/** Dual-pin certificate rotation (PD-032): stage a next pin, collect device acknowledgements, then activate. */
export function createTlsRotation(options: TlsRotationOptions) {
  const { db, tlsDir } = options;
  const now = options.now ?? Date.now;
  const confirmations = options.confirmations ?? new ConfirmationStore();
  const pin = (state: 'active' | 'next'): PinRow | undefined =>
    db.prepare('SELECT spki_sha256, created_at, activated_at FROM tls_pins WHERE state = ? LIMIT 1').get(state) as PinRow | undefined;

  function status(): RotationStatus {
    const active = pin('active');
    const next = pin('next');
    let acked: string[] = [];
    let pending: RotationDevice[] = [];
    if (next) {
      acked = (db.prepare('SELECT device_id FROM tls_pin_acks WHERE spki_sha256 = ? ORDER BY device_id').all(next.spki_sha256) as unknown as Array<{ device_id: string }>).map((r) => r.device_id);
      pending = (db
        .prepare(
          `SELECT device_id, display_name FROM devices WHERE revoked_at IS NULL AND unenrolled_at IS NULL
           AND device_id NOT IN (SELECT device_id FROM tls_pin_acks WHERE spki_sha256 = ?) ORDER BY registered_at, device_id`,
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

  function stage(input: { restage?: boolean } = {}): { spkiSha256: string; restaged: boolean } {
    const existing = pin('next');
    if (existing && input.restage !== true) throw new RotationError('conflict', 'A next certificate is already staged. Use --restage to replace it.');
    const { keyPem, certPem } = generateSelfSigned({ hubInstanceId: options.hubInstanceId });
    const spki = spkiSha256(certPem);
    writeFileSync(path.join(tlsDir, NEXT_KEY_FILE), keyPem, { mode: 0o600 });
    writeFileSync(path.join(tlsDir, NEXT_CERT_FILE), certPem, { mode: 0o600 });
    const at = new Date(now()).toISOString();
    transaction(db, () => {
      if (existing) db.prepare("DELETE FROM tls_pins WHERE state = 'next'").run();
      db.prepare("INSERT INTO tls_pins(spki_sha256, cert_pem, key_ref, state, created_at, activated_at) VALUES(?, ?, ?, 'next', ?, NULL)").run(spki, certPem, NEXT_KEY_FILE, at);
      audit(db, { event: 'tls.rotation-staged', outcome: 'success', actorKind: 'cli', detail: { spkiSha256: spki, restaged: existing !== undefined }, now: now() });
    });
    options.announceNext?.(spki);
    return { spkiSha256: spki, restaged: existing !== undefined };
  }

  const acknowledge = (deviceId: string, spki: string): boolean => acknowledgeTlsPin(db, deviceId, spki, now());

  const digestOf = (nextSpki: string, pendingIds: readonly string[], force: boolean): string =>
    createHash('sha256').update(`${nextSpki}|${[...pendingIds].sort().join(',')}|${force ? 'force' : 'safe'}`).digest('hex');

  function previewActivate(input: { force?: boolean } = {}) {
    const state = status();
    if (!state.next) throw new RotationError('not-staged', 'No next certificate is staged. Run "dude-hub tls rotate" first.');
    const force = input.force === true;
    if (state.pending.length > 0 && !force) {
      throw new RotationError('conflict', `${state.pending.length} device(s) have not acknowledged the next certificate: ${state.pending.map((d) => d.displayName).join(', ')}. Wait for them to connect, or use --force.`);
    }
    const at = now();
    const confirmToken = confirmations.issue({ action: TLS_ACTIVATE_ACTION, digest: digestOf(state.next.spkiSha256, state.pending.map((d) => d.deviceId), force), bindingId: BINDING, now: at });
    return {
      confirmToken,
      expiresAt: ConfirmationStore.expiresAt(at),
      summary: { activeSpkiSha256: state.active?.spkiSha256 ?? null, nextSpkiSha256: state.next.spkiSha256, force, requirePairing: state.pending },
    };
  }

  function applyActivate(input: { confirmToken: string; force?: boolean }) {
    const state = status();
    const next = state.next;
    if (!next) throw new RotationError('not-staged', 'No next certificate is staged.');
    const force = input.force === true;
    const result = confirmations.consumeDetailed({
      token: input.confirmToken, action: TLS_ACTIVATE_ACTION, digest: digestOf(next.spkiSha256, state.pending.map((d) => d.deviceId), force), bindingId: BINDING, now: now(),
    });
    if (result === 'invalid') throw new RotationError('confirmation-required', 'The confirmation is missing, expired or already used.');
    if (result === 'digest-mismatch') throw new RotationError('conflict', 'Devices or the staged certificate changed since the preview. Run the preview again.');
    if (state.pending.length > 0 && !force) throw new RotationError('conflict', 'Devices have not acknowledged the next certificate.');

    const nextKeyFile = path.join(tlsDir, NEXT_KEY_FILE);
    const nextCertFile = path.join(tlsDir, NEXT_CERT_FILE);
    if (!existsSync(nextKeyFile) || !existsSync(nextCertFile)) throw new RotationError('internal', 'The staged certificate files are missing. Run "dude-hub tls rotate --restage".');
    const key = readFileSync(nextKeyFile, 'utf8');
    const cert = readFileSync(nextCertFile, 'utf8');
    if (spkiSha256(cert) !== next.spkiSha256 || spkiSha256(key) !== next.spkiSha256) {
      throw new RotationError('internal', 'The staged certificate files do not match the staged pin. Run "dude-hub tls rotate --restage".');
    }
    const stamp = new Date(now()).toISOString().replace(/[-:.]/g, '');
    const keyFile = path.join(tlsDir, 'key.pem');
    const certFile = path.join(tlsDir, 'cert.pem');
    const moved: Array<[string, string]> = [];
    const move = (from: string, to: string): void => { renameSync(from, to); moved.push([from, to]); };
    try {
      if (existsSync(keyFile)) move(keyFile, path.join(tlsDir, `retired-${stamp}-key.pem`));
      if (existsSync(certFile)) move(certFile, path.join(tlsDir, `retired-${stamp}-cert.pem`));
      move(nextKeyFile, keyFile);
      move(nextCertFile, certFile);
      const at = new Date(now()).toISOString();
      transaction(db, () => {
        db.prepare("UPDATE tls_pins SET state = 'retired' WHERE state = 'active'").run();
        db.prepare("UPDATE tls_pins SET state = 'active', activated_at = ?, key_ref = NULL WHERE spki_sha256 = ?").run(at, next.spkiSha256);
        audit(db, {
          event: 'tls.rotation-activated', outcome: 'success', actorKind: 'cli',
          detail: { spkiSha256: next.spkiSha256, forced: force, unacknowledged: state.pending.map((d) => d.deviceId) }, now: now(),
        });
      });
    } catch (error) {
      for (const [from, to] of moved.reverse()) { try { renameSync(to, from); } catch { /* best effort */ } }
      throw error;
    }
    options.applySecureContext?.({ key, cert, minVersion: 'TLSv1.2' });
    return { activated: true, spkiSha256: next.spkiSha256, previousSpkiSha256: state.active?.spkiSha256 ?? null, requirePairing: force ? state.pending : [] };
  }

  return { status, stage, acknowledge, previewActivate, applyActivate };
}

export type TlsRotation = ReturnType<typeof createTlsRotation>;
