import { describe, expect, it } from 'vitest';
import { presentTestKnobs, readHubTestOverrides } from './test-overrides.js';

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
  it('reports which knobs are present', () => {
    expect(presentTestKnobs({})).toEqual([]);
    expect(presentTestKnobs({ DUDE_HUB_TEST_SYNC_COMPACTION_MS: '0', DUDE_HUB_TEST_RELAX_RATE_LIMITS: '' })).toEqual(['DUDE_HUB_TEST_SYNC_COMPACTION_MS']);
  });
});
