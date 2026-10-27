import { mkdtempSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { Db } from '@dude/sqlite-store';
import type { HubOidcConfig } from '../../config/hub-config.js';
import { openHubDb } from '../../db/open-hub-db.js';
import { createClientSecretReader } from './client-secret.js';
import { createOidcClient } from './client.js';
import type { OidcClient, OidcClientOptions } from './client.js';
import { createFakeIdp } from './fake-idp.js';
import type { FakeIdp, FakeIdpOptions } from './fake-idp.js';

/** Spec fixtures for the OIDC core (never imported by production code). */
export const OWNER_ID = 'owner-1';
export const REDIRECT_ORIGIN = 'https://hub.example.com';
export const T0 = Date.parse('2026-10-27T12:00:00.000Z');

const roots: string[] = [];
const closers: Array<() => void> = [];
export function cleanOidcFixtures(): void {
  for (const close of closers.splice(0)) { try { close(); } catch { /* already closed */ } }
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
}

/** A migrated `dude.db` with one environment and one owner. */
export function openTestHubDb(): Db {
  const root = mkdtempSync(path.join(os.tmpdir(), 'hub-oidc-'));
  roots.push(root);
  const opened = openHubDb({ dbFile: path.join(root, 'data', 'dude.db'), preMigrationDir: path.join(root, 'data', 'pre-migration') });
  if (opened.status !== 'ready') throw new Error('expected a ready database');
  closers.push(() => { opened.hub.close(); });
  opened.hub.db.exec(`
INSERT INTO environment(environment_id, display_name, created_at) VALUES ('env-1', 'Home', '2026-10-01T00:00:00.000Z');
INSERT INTO owner(owner_id, environment_id, display_name, created_at) VALUES ('${OWNER_ID}', 'env-1', 'Owner', '2026-10-01T00:00:00.000Z');`);
  return opened.hub.db;
}

export interface OidcHarness {
  db: Db;
  idp: FakeIdp;
  client: OidcClient;
  config: HubOidcConfig;
  clock: { now: number };
  /** Mutable client-secret state: what the secret source answers. */
  secret: { value: string | null | 'unreadable' };
}

export async function createOidcHarness(options: { idp?: FakeIdpOptions; client?: Partial<OidcClientOptions>; config?: Partial<HubOidcConfig> } = {}): Promise<OidcHarness> {
  const clock = { now: T0 };
  const idp = await createFakeIdp({ now: () => clock.now, ...options.idp });
  const db = openTestHubDb();
  const config: HubOidcConfig = { issuer: idp.issuer, clientId: idp.clientId, redirectOrigin: REDIRECT_ORIGIN, ...options.config };
  const secret: OidcHarness['secret'] = { value: idp.clientSecret };
  const read = createClientSecretReader({
    getText: () => {
      if (secret.value === 'unreadable') throw new Error('the stored secret is unreadable');
      return secret.value;
    },
  });
  const client = createOidcClient({ config, db, readClientSecret: read, fetch: idp.fetch, now: () => clock.now, ...options.client });
  return { db, idp, client, config, clock, secret };
}
