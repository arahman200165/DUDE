import { createHash } from 'node:crypto';
import { mkdtempSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { BackupDeps } from '@dude/hub-backup';
import { setMeta } from '@dude/sqlite-store';
import type { Db } from '@dude/sqlite-store';
import { openHubDb } from '../db/open-hub-db.js';
import type { HubDb } from '../db/open-hub-db.js';
import { hubPaths } from '../config/data-dir.js';
import type { HubPaths } from '../config/data-dir.js';

/** Test-only helpers for the backup specs (never imported by production code). */
export const SECRET_MARKER = 'SECRETMARKER-7f3a91c2d4e8';

export function tempRoot(label: string): string {
  return mkdtempSync(path.join(os.tmpdir(), `dude-hub-backup-${label}-`));
}

/** A cheap deterministic KDF so most specs do not pay for Argon2id. */
export function cheapDeps(now: () => Date = () => new Date('2026-10-04T12:00:00Z')): BackupDeps {
  let counter = 0;
  return {
    deriveKey: (passphrase, salt, params) =>
      Promise.resolve(new Uint8Array(createHash('sha256').update(passphrase).update(salt).update(JSON.stringify(params)).digest())),
    randomBytes: (n) => {
      counter += 1;
      return new Uint8Array(createHash('sha256').update(`rand-${counter}`).digest()).slice(0, n);
    },
    now,
  };
}

export function openFixtureHub(root: string): { hub: HubDb; paths: HubPaths } {
  const paths = hubPaths(root);
  const result = openHubDb({ dbFile: paths.dbFile, preMigrationDir: paths.preMigrationDir });
  if (result.status !== 'ready') throw new Error(result.message);
  return { hub: result.hub, paths };
}

/** Seeds transient (scrubbed) and durable (kept) rows; secrets in the transient rows all carry SECRET_MARKER. */
export function seedHubDb(db: Db): void {
  const at = '2026-10-04T10:00:00.000Z';
  const later = '2026-10-04T11:00:00.000Z';
  db.exec(`
INSERT INTO environment(environment_id, display_name, created_at) VALUES ('env-1', 'Home', '${at}');
INSERT INTO owner(owner_id, environment_id, display_name, created_at) VALUES ('owner-1', 'env-1', 'Owner', '${at}');
INSERT INTO owner_credentials(owner_id, kind, algorithm, params_json, salt, hash, updated_at) VALUES ('owner-1', 'password', 'argon2id', '{}', x'0102', x'0304', '${at}');
INSERT INTO devices(device_id, environment_id, display_name, platform, app_version, capabilities_json, hub_eligible, protocol_version, registered_at)
  VALUES ('dev-1', 'env-1', 'Laptop', 'win32', '1.0.0', '{}', 1, 1, '${at}');
INSERT INTO device_keys(key_id, device_id, algorithm, public_key, created_at) VALUES ('key-1', 'dev-1', 'ed25519', x'aabb', '${at}');
INSERT INTO device_tokens(token_hash, device_id, key_id, issued_at, expires_at) VALUES ('${SECRET_MARKER}-token', 'dev-1', 'key-1', '${at}', '${later}');
INSERT INTO sessions(session_hash, owner_id, kind, created_at, last_active_at, idle_expires_at, absolute_expires_at)
  VALUES ('${SECRET_MARKER}-session', 'owner-1', 'cookie', '${at}', '${at}', '${later}', '${later}');
INSERT INTO challenges(nonce, purpose, created_at, expires_at) VALUES ('${SECRET_MARKER}-nonce', 'enroll', '${at}', '${later}');
INSERT INTO pairing_codes(code_hash, created_by_session_hash, created_at, expires_at) VALUES ('${SECRET_MARKER}-pair', 'x', '${at}', '${later}');
INSERT INTO setup_state(id, token_hash, created_at) VALUES (1, '${SECRET_MARKER}-setup', '${at}');
INSERT INTO throttle(throttle_key, failures, window_started_at) VALUES ('ip:203.0.113.9', 3, '${at}');
INSERT INTO ip_blocks(ip, strikes, blocked_until, reason, updated_at) VALUES ('203.0.113.9', 1, '${later}', 'flood', '${at}');
INSERT INTO audit_events(at, actor_kind, event, outcome) VALUES ('${at}', 'owner', 'auth.signed-in', 'success');
INSERT INTO records(environment_id, entity_type, entity_id, scope, schema_version, revision, payload_json, updated_at)
  VALUES ('env-1', 'note', 'n1', 'environment', 1, 1, '{"t":"hello"}', '${at}');
INSERT INTO change_feed(revision, environment_id, entity_type, entity_id, op, at) VALUES (1, 'env-1', 'note', 'n1', 'upsert', '${at}');
`);
  setMeta(db, 'csrf_key', `${SECRET_MARKER}-csrf`);
  setMeta(db, 'alerts_seen_seq', '5');
  setMeta(db, 'hub_addresses', `{"addresses":["${SECRET_MARKER}"]}`);
  setMeta(db, 'reachability_last', '{}');
  setMeta(db, 'acme_last_attempt', '1');
  setMeta(db, 'revoked_attempt:token:dev-1', '123');
  setMeta(db, 'revoked-attempts:legacy', '123');
  setMeta(db, 'authority_epoch', '3');
}
