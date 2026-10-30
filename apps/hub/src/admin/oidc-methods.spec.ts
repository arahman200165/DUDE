import { readFileSync, rmSync } from 'node:fs';
import { afterEach, describe, expect, it } from 'vitest';
import { openFixtureHub, tempRoot } from '../backup/backup-fixture.js';
import { loadOrCreateHubConfig } from '../config/hub-config.js';
import type { HubDb } from '../db/open-hub-db.js';
import { AdminError } from './admin-endpoint.js';
import { buildAdminMethods } from './methods.js';

const roots: string[] = [];
const hubs: HubDb[] = [];
afterEach(() => {
  for (const hub of hubs.splice(0)) hub.close();
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

const SECRET = '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67';
const GOOD = { clientId: '1234-abc.apps.googleusercontent.com', clientSecret: SECRET, redirectOrigin: 'https://notes.example.com' };

function fixture(withStore = true) {
  const root = tempRoot('oidc-config');
  roots.push(root);
  const { hub, paths } = openFixtureHub(root);
  hubs.push(hub);
  const stored: string[] = [];
  const methods = buildAdminMethods({
    db: hub.db, hubVersion: '1.2.3', hubInstanceId: hub.hubInstanceId, bind: 'loopback', getPort: () => 1, startedAt: 0,
    configDir: paths.configDir, configFile: paths.configFile, spkiSha256: 'S'.repeat(43), paths,
    ...(withStore ? { oidc: { putClientSecret: (secret: string) => { stored.push(secret); } } } : {}),
    now: () => Date.parse('2026-10-29T12:00:00Z'),
  });
  const fail = async (params: unknown): Promise<AdminError> => {
    try { await methods['oidc.configure']!(params); } catch (error) { return error as AdminError; }
    throw new Error('oidc.configure did not fail');
  };
  return { hub, paths, methods, stored, fail };
}

describe('oidc.configure (admin pipe)', () => {
  it('writes the public block, stores the secret only through the store and audits without it', async () => {
    const f = fixture();
    const result = await f.methods['oidc.configure']!(GOOD);
    expect(result).toEqual({ configured: true, redirectOrigin: 'https://notes.example.com', restartRequired: true });
    expect(f.stored).toEqual([SECRET]);
    expect(loadOrCreateHubConfig(f.paths.configFile).oidc).toEqual({ issuer: 'https://accounts.google.com', clientId: GOOD.clientId, redirectOrigin: GOOD.redirectOrigin });
    expect(readFileSync(f.paths.configFile, 'utf8')).not.toContain(SECRET);
    const rows = f.hub.db.prepare("SELECT * FROM audit_events WHERE event = 'oidc.configured'").all() as unknown[];
    expect(rows).toHaveLength(1);
    expect(JSON.stringify(f.hub.db.prepare('SELECT * FROM audit_events').all())).not.toContain(SECRET);
  });

  it('is idempotent and replaces an earlier block', async () => {
    const f = fixture();
    await f.methods['oidc.configure']!(GOOD);
    await f.methods['oidc.configure']!({ ...GOOD, redirectOrigin: 'https://other.example.com' });
    expect(loadOrCreateHubConfig(f.paths.configFile).oidc?.redirectOrigin).toBe('https://other.example.com');
  });

  it('refuses malformed input without echoing the secret and without storing anything', async () => {
    const f = fixture();
    for (const bad of [
      { ...GOOD, clientSecret: 'short' }, { ...GOOD, clientSecret: 'has a space in it 1234' }, { ...GOOD, clientSecret: undefined },
      { ...GOOD, clientId: '' }, { ...GOOD, clientId: 'has space' }, { ...GOOD, redirectOrigin: 'http://example.com' }, { ...GOOD, redirectOrigin: 'https://x.example.com/path' },
      { ...GOOD, issuer: 'https://evil.example.com' }, [], 'text', null,
    ]) {
      const error = await f.fail(bad);
      expect(error.code).toBe('bad-request');
      expect(error.message).not.toContain(SECRET);
    }
    expect(f.stored).toEqual([]);
    expect(loadOrCreateHubConfig(f.paths.configFile).oidc).toBeUndefined();
  });

  it('is unavailable without a secret store', async () => {
    expect((await fixture(false).fail(GOOD)).code).toBe('unavailable');
  });
});
