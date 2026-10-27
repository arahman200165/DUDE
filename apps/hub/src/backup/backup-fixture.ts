import { createHash, randomBytes } from 'node:crypto';
import { mkdtempSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { REPO_OBJECT_NAME, createRepository } from '@dude/hub-backup';
import type { BackupDeps } from '@dude/hub-backup';
import { createLocalFolderDestination } from './destinations/local-folder.js';
import { createLocalBlobStore } from '../blobs/local-blob-store.js';
import { addBlobRef, recordBlob, removeBlobRef } from '../blobs/registry.js';
import { openSaveSphereDb } from '../savesphere-db/open.js';
import { setMeta } from '@dude/sqlite-store';
import type { Db } from '@dude/sqlite-store';
import { openHubDb } from '../db/open-hub-db.js';
import type { HubDb } from '../db/open-hub-db.js';
import { hubPaths } from '../config/data-dir.js';
import type { HubPaths } from '../config/data-dir.js';
import type { MasterKeyStore } from './master-key.js';

/** Test-only helpers for the backup specs (never imported by production code). */
export const SECRET_MARKER = 'SECRETMARKER-7f3a91c2d4e8';

/** An in-memory backup v2 master-key store (the production one is DPAPI or a 0600 file); `key()` peeks at the stored key. */
export function memoryMasterKeys(): MasterKeyStore & { key(): Uint8Array | null; saves: number } {
  let stored: Uint8Array | null = null;
  const store = {
    saves: 0,
    exists: () => stored !== null,
    load: () => (stored === null ? null : stored.slice()),
    save: (key: Uint8Array) => { stored = key.slice(); store.saves += 1; },
    clear: () => { const had = stored !== null; stored = null; return had; },
    key: () => stored,
  };
  return store;
}

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

/** Like `cheapDeps`, but with real randomness: several writers into one repository never draw the same object id. */
export function randomCheapDeps(now: () => Date = () => new Date('2026-10-04T12:00:00Z')): BackupDeps {
  return { ...cheapDeps(now), randomBytes: (n) => new Uint8Array(randomBytes(n)) };
}

/** Creates a backup v2 repository (`repo` only) in `folder` wrapping `masterKey` (random when absent) under `passphrase`. */
export async function makeRepositoryFolder(folder: string, options: { passphrase: string; deps: BackupDeps; masterKey?: Uint8Array }): Promise<{ repoId: string; masterKey: Uint8Array }> {
  const masterKey = options.masterKey ?? new Uint8Array(randomBytes(32));
  const { repository, object } = await createRepository(options.passphrase, options.deps, undefined, { masterKey });
  const repoId = repository.repoId;
  repository.close();
  const out = await createLocalFolderDestination({ id: 'fixture', label: 'fixture', folder }).sink().create(REPO_OBJECT_NAME);
  await out.write(object);
  await out.commit();
  return { repoId, masterKey };
}

/** A real `savesphere.db` and blob store under `paths`, with a helper that stores, catalogues and references content. */
export function openSaveSphereFixture(paths: HubPaths, now: () => number = () => Date.parse('2026-10-04T12:00:00Z')) {
  const opened = openSaveSphereDb(paths);
  if (opened.status !== 'ready') throw new Error('expected a ready savesphere.db');
  const store = createLocalBlobStore(paths);
  const sdb = opened.store.db;
  return {
    sdb,
    store,
    close: () => opened.store.close(),
    /** Stores `bytes`, catalogues them and (unless `ownerId` is null) references them as an attachment; returns the hash. */
    async add(bytes: Uint8Array, ownerId: string | null = `owner-${randomBytes(4).toString('hex')}`): Promise<string> {
      const put = await store.put(bytes);
      recordBlob(sdb, { sha256: put.sha256, size: put.size, now: now(), created: put.created });
      if (ownerId !== null) addBlobRef(sdb, { sha256: put.sha256, ownerKind: 'attachment', ownerId, now: now() });
      return put.sha256;
    },
    unref(sha256: string, ownerId: string): void {
      removeBlobRef(sdb, { sha256, ownerKind: 'attachment', ownerId, now: now() });
    },
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
  // Older-schema fixtures (migration specs) predate the notifications table.
  if (db.prepare("SELECT 1 AS x FROM sqlite_master WHERE type = 'table' AND name = 'notifications'").get() !== undefined) {
    db.exec(`INSERT INTO notifications(id, created_at, source_key, kind, severity, title, body) VALUES ('notif-1', '${at}', 'audit:1', 'security-alert', 'warning', 'Security alert', 'A device was revoked.');`);
  }
  // Collaborative documents (31J, migration 0010) are content, not per-instance state: they ride along in a backup.
  if (db.prepare("SELECT 1 AS x FROM sqlite_master WHERE type = 'table' AND name = 'collab_docs'").get() !== undefined) {
    db.exec(`
INSERT INTO collab_docs(doc_key, kind, entity_type, entity_id, state, bytes, materialized_revision, created_at, updated_at, last_opened_at)
  VALUES ('scratchpad:default', 'scratchpad', 'scratchpad', 'default', x'0000', 2, 1, '${at}', '${at}', '${at}');
INSERT INTO collab_updates(doc_key, update_blob, at) VALUES ('scratchpad:default', x'00', '${at}');
INSERT INTO collab_snapshots(id, doc_key, taken_at, payload_json, bytes) VALUES ('snap-1', 'scratchpad:default', '${at}', '{}', 2);
INSERT INTO collab_bases(doc_key, revision, payload_json, at) VALUES ('scratchpad:default', 1, '{}', '${at}');`);
  }
  // OIDC (32-SS1, migration 0011): both tables are scrubbed from a backup (PD-145); the verifier carries the secret marker.
  if (db.prepare("SELECT 1 AS x FROM sqlite_master WHERE type = 'table' AND name = 'oidc_flows'").get() !== undefined) {
    db.exec(`
INSERT INTO linked_identities(id, owner_id, provider, sub, email, issuer, linked_at) VALUES ('li-1', 'owner-1', 'google', '${SECRET_MARKER}-sub', 'owner@example.com', 'https://accounts.google.com', '${at}');
INSERT INTO oidc_flows(state_hash, nonce_hash, code_verifier, purpose, return_to, created_at, expires_at) VALUES ('${SECRET_MARKER}-state', 'n', '${SECRET_MARKER}-verifier', 'signin', '/', '${at}', '${later}');`);
  }
  setMeta(db, 'csrf_key', `${SECRET_MARKER}-csrf`);
  setMeta(db, 'alerts_seen_seq', '5');
  setMeta(db, 'hub_addresses', `{"addresses":["${SECRET_MARKER}"]}`);
  setMeta(db, 'reachability_last', '{}');
  setMeta(db, 'acme_last_attempt', '1');
  setMeta(db, 'revoked_attempt:token:dev-1', '123');
  setMeta(db, 'revoked-attempts:legacy', '123');
  setMeta(db, 'job_last:audit-prune', '{"startedAt":"2026-10-24T00:00:00.000Z","finishedAt":"2026-10-24T00:00:01.000Z","outcome":"success","summary":"Completed."}');
  setMeta(db, 'authority_epoch', '3');
}
