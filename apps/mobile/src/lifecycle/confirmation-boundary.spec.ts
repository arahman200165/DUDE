import { describe, expect, it } from 'vitest';
import { MobileConfirmationBoundary, MOBILE_LIFECYCLE_CONSEQUENCES } from './confirmation';
import { MobileLifecycle } from './mobile-lifecycle';
import type { MobileStore } from '../storage/store';
import type { MobileHubPorts } from '../hub/types';
import type { MobileEnrollmentService } from '../hub/enrollment';

const state = { contextId: 'environment-a', localRevision: 4, pending: 2, records: 3, detail: 'favorites:hub;settings:merge' };
describe('mobile settings confirmation boundary', () => {
  it('refuses missing, reused, expired, cross-action, cross-context and changed-choice confirmations', () => {
    let now = 0; let id = 0;
    const gate = new MobileConfirmationBoundary(() => `token-${++id}`, () => now);
    expect(() => gate.consume('missing', 'clear-cache', state)).toThrow(/fresh preview/);
    const token = gate.issue('clear-cache', state);
    gate.consume(token, 'clear-cache', state);
    expect(() => gate.consume(token, 'clear-cache', state)).toThrow();
    for (const changed of [{ ...state, contextId: 'other' }, { ...state, localRevision: 5 }, { ...state, pending: 1 }, { ...state, detail: 'favorites:local;settings:merge' }]) {
      const permit = gate.issue('use-hub', state);
      expect(() => gate.consume(permit, 'use-hub', changed)).toThrow();
      expect(() => gate.consume(permit, 'use-hub', state)).toThrow();
    }
    expect(() => gate.consume(gate.issue('disconnect', state), 'clear-cache', state)).toThrow();
    const expired = gate.issue('clear-cache', state); now = 60_000;
    expect(() => gate.consume(expired, 'clear-cache', state)).toThrow();
    expect(MOBILE_LIFECYCLE_CONSEQUENCES.disconnect).toContain('secret-management');
    expect(MOBILE_LIFECYCLE_CONSEQUENCES['use-hub']).toContain('database-write');
  });
});

function fixture() {
  const events: string[] = [];
  let now = 0; let id = 0; let keyFailure = false; let hubFailure = false;
  const context = { id: 'cache', kind: 'environment', environmentId: 'env', deviceId: 'same-id', writable: true, localRevision: 4, cursor: 5, head: 5, epoch: 1, categories: { favorites: true, settings: true }, consent: true };
  const standalone = { ...context, id: 'local', kind: 'standalone', environmentId: 'local' };
  let activeId = context.id;
  let enrollment: unknown = { deviceId: 'same-id', environmentId: 'env', hubInstanceId: 'hub', keyRef: 'native-only' };
  let attempt: unknown = null;
  const rows = [{ entityType: 'favorite', entityId: 'favorite:json', payload: { id: 'favorite:json' } }];
  const pending = [{ opId: 'stable-uncertain-operation', claimed: true }];
  const store = {
    activeContext: async () => activeId === 'cache' ? context : standalone,
    context: async (contextId: string) => contextId === 'cache' ? context : standalone,
    contexts: async () => [context, standalone], listRecords: async () => rows, pending: async () => pending,
    readEnrollment: async () => enrollment, readPendingAttempt: async () => attempt,
    createRecoveryCopy: async () => { events.push('copy'); return 'copy-id'; },
    archiveActive: async () => { events.push('archive'); context.kind = 'archive'; context.writable = false; enrollment = null; activeId = 'local'; },
    clearContext: async (_contextId: string, revision: number) => { expect(revision).toBe(context.localRevision); events.push('copy'); events.push('clear'); },
    convertArchiveToStandalone: async () => { events.push('copy'); events.push('convert'); },
    importRecovery: async () => { events.push('import'); }, selectContext: async (contextId: string) => { activeId = contextId; events.push('select'); },
    exportRecovery: async () => ({ deviceId: 'same-id', records: rows, pending, authority: { hubInstanceId: 'hub' } }),
  } as unknown as MobileStore;
  const ports = { signer: { deleteKey: async () => { events.push('delete-key'); if (keyFailure) throw new Error('Native key deletion failed.'); } } } as unknown as MobileHubPorts;
  const service = { discardPendingAttempt: async () => { events.push('discard'); attempt = null; } } as unknown as MobileEnrollmentService;
  const lifecycle = new MobileLifecycle(store, ports, service, {
    stopSync: async () => { events.push('stop'); },
    unenroll: async () => { events.push('unenroll'); if (hubFailure) throw new Error('Offline'); },
    changed: async () => { events.push('changed'); },
  }, { id: () => `permit-${++id}`, now: () => now });
  return { lifecycle, events, context, pending, rows, advance: () => { now += 60_000; }, usePendingAttempt: () => { attempt = { deviceId: 'same-id', environmentId: 'env', keyRef: 'pending-native', createdAt: 'now' }; }, switchContext: () => { activeId = 'local'; }, failKey: () => { keyFailure = true; }, failHub: () => { hubFailure = true; }, changeStandalone: () => { standalone.localRevision++; } };
}
describe('mobile lifecycle destructive effects', () => {
  it('preview performs no destruction; missing and stale confirmations keep cache, pending edits and keys', async () => {
    const f = fixture();
    const preview = await f.lifecycle.previewDisconnect();
    expect(f.events).toEqual([]);
    expect(preview.pending).toBe(1);
    await expect(f.lifecycle.disconnect('missing')).rejects.toThrow();
    f.context.localRevision++;
    await expect(f.lifecycle.disconnect(preview.token)).rejects.toThrow();
    expect(f.events).toEqual(['stop', 'stop']);
    expect(f.pending[0].opId).toBe('stable-uncertain-operation');
  });
  it('disconnect quiesces and copies before unenroll, key erase and archive; offline failure is visible', async () => {
    const f = fixture(); f.failHub();
    const preview = await f.lifecycle.previewDisconnect();
    const result = await f.lifecycle.disconnect(preview.token);
    expect(result.warning).toMatch(/owner to revoke/);
    expect(f.events).toEqual(['stop', 'copy', 'unenroll', 'delete-key', 'archive', 'changed']);
    expect(f.pending).toHaveLength(1);
    expect(f.rows).toHaveLength(1);
    await expect(f.lifecycle.disconnect(preview.token)).rejects.toThrow();
  });
  it('native key errors never archive or reset the preserved environment', async () => {
    const f = fixture(); f.failKey();
    const preview = await f.lifecycle.previewDisconnect();
    await expect(f.lifecycle.disconnect(preview.token)).rejects.toThrow(/Native key deletion/);
    expect(f.events).toEqual(['stop', 'copy', 'unenroll', 'delete-key']);
    expect(f.context.writable).toBe(true);
    expect(f.pending).toHaveLength(1);
  });
  it('clear, pending-attempt discard and standalone conversion require distinct unchanged previews', async () => {
    const f = fixture();
    await expect(f.lifecycle.clearCache('missing')).rejects.toThrow();
    await expect(f.lifecycle.discardAttempt('missing')).rejects.toThrow();
    await expect(f.lifecycle.continueStandalone('missing', 'cache')).rejects.toThrow();
    expect(f.events.every(event => event === 'stop')).toBe(true);
    f.usePendingAttempt();
    const discard = await f.lifecycle.previewDiscardAttempt();
    await f.lifecycle.discardAttempt(discard.token);
    expect(f.events.slice(-4)).toEqual(['stop', 'copy', 'discard', 'changed']);
    f.context.kind = 'archive'; f.context.writable = false;
    const convert = await f.lifecycle.previewStandalone('cache'); f.changeStandalone();
    await expect(f.lifecycle.continueStandalone(convert.token, 'cache')).rejects.toThrow();
    const clear = await f.lifecycle.previewClearCache(); f.switchContext();
    await expect(f.lifecycle.clearCache(clear.token)).rejects.toThrow();
    expect(f.events).not.toContain('clear');
    expect(f.events).not.toContain('convert');
  });
  it('imports and archive views stop synchronization before changing context and exports contain data only', async () => {
    const f = fixture();
    f.context.kind = 'archive'; f.context.writable = false;
    await f.lifecycle.importRecovery('manual-transfer');
    await f.lifecycle.selectArchive('cache');
    expect(f.events).toEqual(['stop', 'import', 'changed', 'stop', 'select', 'changed']);
    const exported = await f.lifecycle.exportRecovery('cache');
    expect(exported.text).toContain('stable-uncertain-operation');
    expect(exported.text).not.toContain('native-only');
    expect(exported.text).not.toContain('pending-native');
  });
});
