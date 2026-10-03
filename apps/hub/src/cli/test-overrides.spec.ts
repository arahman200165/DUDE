import { describe, expect, it } from 'vitest';
import { readHubTestOverrides } from './test-overrides.js';

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
});
