import type { Db } from '@dude/sqlite-store';

/** Internal row, including the DPAPI-wrapped device key. Never leaves the agent process. */
export interface HubEnrollmentRow {
  state: 'enrolled' | 'revoked';
  hubInstanceId: string;
  environmentId: string;
  hubUrl: string;
  protocolVersion: number;
  spkiActive: string;
  certActivePem: string;
  spkiNext: string | null;
  certNextPem: string | null;
  keyId: string;
  publicKey: Uint8Array;
  wrappedPrivateKey: Uint8Array;
  enrolledAt: string;
  lastContactAt: string | null;
  revokedAt: string | null;
  updatedAt: string;
}

/** The key-material-free projection that RPC and the renderer may see. */
export interface PublicHubEnrollment {
  state: 'enrolled' | 'revoked';
  hubInstanceId: string;
  environmentId: string;
  hubUrl: string;
  protocolVersion: number;
  spkiActive: string;
  spkiNext: string | null;
  enrolledAt: string;
  lastContactAt: string | null;
  revokedAt: string | null;
}

export type NewHubEnrollment = Omit<HubEnrollmentRow, 'state' | 'spkiNext' | 'certNextPem' | 'lastContactAt' | 'revokedAt' | 'updatedAt'>;

interface RawRow {
  state: 'enrolled' | 'revoked'; hub_instance_id: string; environment_id: string; hub_url: string; protocol_version: number;
  spki_active: string; cert_active_pem: string; spki_next: string | null; cert_next_pem: string | null; key_id: string;
  public_key: Uint8Array; wrapped_private_key: Uint8Array; enrolled_at: string; last_contact_at: string | null;
  revoked_at: string | null; updated_at: string;
}

/** Internal read, includes the wrapped key. */
export function getEnrollment(db: Db): HubEnrollmentRow | null {
  const r = db.prepare('SELECT * FROM hub_enrollment WHERE id = 1').get() as unknown as RawRow | undefined;
  if (!r) return null;
  return {
    state: r.state, hubInstanceId: r.hub_instance_id, environmentId: r.environment_id, hubUrl: r.hub_url, protocolVersion: Number(r.protocol_version),
    spkiActive: r.spki_active, certActivePem: r.cert_active_pem, spkiNext: r.spki_next, certNextPem: r.cert_next_pem, keyId: r.key_id,
    publicKey: r.public_key, wrappedPrivateKey: r.wrapped_private_key, enrolledAt: r.enrolled_at, lastContactAt: r.last_contact_at,
    revokedAt: r.revoked_at, updatedAt: r.updated_at,
  };
}

export function publicEnrollment(db: Db): PublicHubEnrollment | null {
  const e = getEnrollment(db);
  if (!e) return null;
  return {
    state: e.state, hubInstanceId: e.hubInstanceId, environmentId: e.environmentId, hubUrl: e.hubUrl, protocolVersion: e.protocolVersion,
    spkiActive: e.spkiActive, spkiNext: e.spkiNext, enrolledAt: e.enrolledAt, lastContactAt: e.lastContactAt, revokedAt: e.revokedAt,
  };
}

/** Replaces any existing enrollment with a fresh 'enrolled' one. */
export function saveEnrollment(db: Db, e: NewHubEnrollment, now: Date): void {
  const iso = now.toISOString();
  db.prepare(
    `INSERT OR REPLACE INTO hub_enrollment (id, state, hub_instance_id, environment_id, hub_url, protocol_version, spki_active, cert_active_pem,
       spki_next, cert_next_pem, key_id, public_key, wrapped_private_key, enrolled_at, last_contact_at, revoked_at, updated_at)
     VALUES (1, 'enrolled', ?, ?, ?, ?, ?, ?, NULL, NULL, ?, ?, ?, ?, NULL, NULL, ?)`,
  ).run(e.hubInstanceId, e.environmentId, e.hubUrl, e.protocolVersion, e.spkiActive, e.certActivePem, e.keyId, e.publicKey, e.wrappedPrivateKey, e.enrolledAt, iso);
}

/** Keeps the row (so the UI can say "revoked, re-pair") but marks it unusable. */
export function markRevoked(db: Db, now: Date): boolean {
  const iso = now.toISOString();
  return Number(db.prepare("UPDATE hub_enrollment SET state = 'revoked', revoked_at = ?, updated_at = ? WHERE id = 1 AND state = 'enrolled'").run(iso, iso).changes) > 0;
}

export function clearEnrollment(db: Db): boolean {
  return Number(db.prepare('DELETE FROM hub_enrollment WHERE id = 1').run().changes) > 0;
}

/** Stage the rotated Hub certificate pin (dual-pin rotation). */
export function setNextPin(db: Db, spki: string, certPem: string, now: Date): boolean {
  return Number(db.prepare('UPDATE hub_enrollment SET spki_next = ?, cert_next_pem = ?, updated_at = ? WHERE id = 1').run(spki, certPem, now.toISOString()).changes) > 0;
}

/** Makes the staged pin the active one. False when nothing is staged. */
export function promoteNextPin(db: Db, now: Date): boolean {
  return Number(db.prepare(
    `UPDATE hub_enrollment SET spki_active = spki_next, cert_active_pem = cert_next_pem, spki_next = NULL, cert_next_pem = NULL, updated_at = ?
     WHERE id = 1 AND spki_next IS NOT NULL AND cert_next_pem IS NOT NULL`,
  ).run(now.toISOString()).changes) > 0;
}

export function touchContact(db: Db, now: Date): boolean {
  const iso = now.toISOString();
  return Number(db.prepare('UPDATE hub_enrollment SET last_contact_at = ?, updated_at = ? WHERE id = 1').run(iso, iso).changes) > 0;
}
