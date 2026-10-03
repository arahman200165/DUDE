import { describe, expect, it } from 'vitest';
import { defaultCategoryMap, describeSync, type SyncStatus } from './index.js';

const status = (patch: Partial<SyncStatus>): SyncStatus => ({
  phase: 'idle', lastSyncAt: null, cursor: 1, headRevision: 1, pending: 0, held: 0, quarantined: 0, stranded: 0, conflicts: 0, categories: defaultCategoryMap(), lastError: null, ...patch,
});

describe('describeSync web variant', () => {
  const web = { host: 'web' } as const;

  it('reads live, unreachable, expired and incompatible in browser wording', () => {
    expect(describeSync(status({}), web)).toMatchObject({ kind: 'synced', label: 'Live' });
    const offline = describeSync(status({ phase: 'offline' }), web);
    expect(offline).toMatchObject({ kind: 'offline', label: 'Hub unreachable' });
    expect(offline?.detail).toContain('Hub unreachable — changes paused');
    expect(describeSync(status({ phase: 'revoked' }), web)).toMatchObject({ kind: 'revoked', label: 'Session expired' });
    expect(describeSync(status({ phase: 'hub-outdated' }), web)).toMatchObject({ kind: 'attention', label: 'Reload needed' });
    expect(describeSync(status({ phase: 'syncing' }), web)?.kind).toBe('syncing');
  });

  it('keeps the desktop wording by default', () => {
    expect(describeSync(status({}))?.label).toBe('Synced');
    expect(describeSync(status({ phase: 'offline' }))?.label).toBe('Offline');
  });
});
