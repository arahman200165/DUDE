import { describe, expect, it } from 'vitest';
import { plainSecretsKnob, presentTestKnobs, readHubTestOverrides } from './test-overrides.js';

describe('readHubTestOverrides', () => {
  it('is empty unless a knob is explicitly set', () => {
    expect(readHubTestOverrides({})).toEqual({});
    expect(readHubTestOverrides({ DUDE_HUB_TEST_RELAX_RATE_LIMITS: '0', DUDE_HUB_TEST_SYNC_RETENTION_DAYS: 'abc' })).toEqual({});
  });
  it('relaxes limits and sets sync retention/compaction', () => {
    const o = readHubTestOverrides({ DUDE_HUB_TEST_RELAX_RATE_LIMITS: '1', DUDE_HUB_TEST_SYNC_RETENTION_DAYS: '0.00002', DUDE_HUB_TEST_SYNC_COMPACTION_MS: '0' });
    expect(o.rateLimit?.auth?.burst).toBeGreaterThan(1000);
    expect(o.sync).toEqual({ retentionDays: 0.00002, compactionIntervalMs: 0 });
  });
  it('shortens the scheduled-backup check and the history snapshot timings, refusing a zero check period', () => {
    expect(readHubTestOverrides({ DUDE_HUB_TEST_BACKUP_CHECK_MS: '1000', DUDE_HUB_TEST_COLLAB_SNAPSHOT_IDLE_MS: '800', DUDE_HUB_TEST_COLLAB_SNAPSHOT_MIN_INTERVAL_MS: '0' }))
      .toEqual({ backupCheckMs: 1000, collab: { history: { idleMs: 800, minIntervalMs: 0 } } });
    expect(readHubTestOverrides({ DUDE_HUB_TEST_BACKUP_CHECK_MS: '0', DUDE_HUB_TEST_COLLAB_SNAPSHOT_IDLE_MS: '-1' })).toEqual({});
  });
  it('ignores every knob in a release build', () => {
    const env = {
      DUDE_HUB_TEST_RELAX_RATE_LIMITS: '1', DUDE_HUB_TEST_SYNC_RETENTION_DAYS: '1', DUDE_HUB_TEST_SYNC_COMPACTION_MS: '5', DUDE_HUB_TEST_BACKUP_CHECK_MS: '1000',
      DUDE_HUB_TEST_COLLAB_SNAPSHOT_IDLE_MS: '1', DUDE_HUB_TEST_COLLAB_SNAPSHOT_MIN_INTERVAL_MS: '0',
    };
    expect(readHubTestOverrides(env, false)).toEqual({});
    expect(presentTestKnobs(env)).toHaveLength(6);
  });
  it('reads the platform exit knobs (32-SS1): the fake identity provider on loopback only, the stub connector with a valid edge port, plain secrets', () => {
    expect(readHubTestOverrides({ DUDE_HUB_TEST_OIDC_IDP_URL: 'http://127.0.0.1:4555' })).toEqual({ oidcIdpUrl: 'http://127.0.0.1:4555' });
    for (const bad of ['http://example.com:80', 'https://127.0.0.1:4555', 'http://127.0.0.1', 'http://127.0.0.1:4555/x']) expect(readHubTestOverrides({ DUDE_HUB_TEST_OIDC_IDP_URL: bad })).toEqual({});
    expect(readHubTestOverrides({ DUDE_HUB_TEST_CLOUDFLARED_STUB: '/x/stub.mjs', DUDE_HUB_TEST_CLOUDFLARED_EDGE_PORT: '4556' })).toEqual({ cloudflaredStub: { path: '/x/stub.mjs', edgePort: 4556 } });
    expect(readHubTestOverrides({ DUDE_HUB_TEST_CLOUDFLARED_STUB: '/x/stub.mjs' })).toEqual({});
    expect(readHubTestOverrides({ DUDE_HUB_TEST_CLOUDFLARED_STUB: '/x/stub.mjs', DUDE_HUB_TEST_CLOUDFLARED_EDGE_PORT: '0' })).toEqual({});
    expect(plainSecretsKnob({ DUDE_HUB_TEST_PLAIN_SECRETS: '1' }, true)).toBe(true);
    expect(plainSecretsKnob({ DUDE_HUB_TEST_PLAIN_SECRETS: '1' }, false)).toBe(false);
    expect(plainSecretsKnob({}, true)).toBe(false);
    const env = { DUDE_HUB_TEST_OIDC_IDP_URL: 'http://127.0.0.1:4555', DUDE_HUB_TEST_CLOUDFLARED_STUB: '/x/stub.mjs', DUDE_HUB_TEST_CLOUDFLARED_EDGE_PORT: '4556', DUDE_HUB_TEST_PLAIN_SECRETS: '1' };
    expect(readHubTestOverrides(env, false)).toEqual({});
    expect(presentTestKnobs(env)).toHaveLength(4);
  });
  it('reports which knobs are present', () => {
    expect(presentTestKnobs({})).toEqual([]);
    expect(presentTestKnobs({ DUDE_HUB_TEST_SYNC_COMPACTION_MS: '0', DUDE_HUB_TEST_RELAX_RATE_LIMITS: '' })).toEqual(['DUDE_HUB_TEST_SYNC_COMPACTION_MS']);
  });
});
