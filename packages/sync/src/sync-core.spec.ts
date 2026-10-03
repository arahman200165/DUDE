import { describe, it, expect } from 'vitest';
import { SYNC_CATEGORIES, SYNC_CATEGORY_IDS, defaultCategoryMap } from './categories.js';
import {
  SYNC_ENTITY_TYPES, SYNC_POLICIES, SINGLETON_ENTITY_TYPES, categoryOf, isSyncEntityType, syncPolicyFor,
} from './policies.js';
import { deepEqual, merge3 } from './merge3.js';
import { stripNonSyncable } from './strip-non-syncable.js';
import { coalesceOutbox } from './outbox/coalesce.js';
import type { OutboxOp } from './outbox/outbox-op.model.js';

describe('categories and policies', () => {
  it('defines every category once with the specified defaults', () => {
    expect(SYNC_CATEGORIES.map((c) => c.id)).toEqual([...SYNC_CATEGORY_IDS]);
    const defaults = defaultCategoryMap();
    expect(Object.keys(defaults).sort()).toEqual([...SYNC_CATEGORY_IDS].sort());
    for (const id of ['usage', 'workspace-layout', 'scratchpad'] as const) expect(defaults[id]).toBe(false);
    for (const id of ['settings', 'favorites', 'pipelines', 'projects', 'workspaces', 'home'] as const) expect(defaults[id]).toBe(true);
  });

  it('gives every entity type a policy and a known category', () => {
    for (const t of SYNC_ENTITY_TYPES) {
      expect(syncPolicyFor(t)).toBe(SYNC_POLICIES[t]);
      expect(SYNC_CATEGORY_IDS).toContain(categoryOf(t));
    }
    expect(SYNC_POLICIES.project.fieldRules).toEqual({ lastActivatedAt: 'max-iso' });
    expect(SYNC_POLICIES['workspace-layout'].apply).toBe('next-launch');
  });

  it('rejects unknown entity types', () => {
    expect(isSyncEntityType('favorite')).toBe(true);
    expect(isSyncEntityType('nope')).toBe(false);
    expect(syncPolicyFor('nope')).toBeUndefined();
    expect(categoryOf('nope')).toBeUndefined();
  });

  it('lists singletons as known entity types', () => {
    for (const t of SINGLETON_ENTITY_TYPES) expect(isSyncEntityType(t)).toBe(true);
    expect([...SINGLETON_ENTITY_TYPES].sort()).toEqual(['home-layout', 'scratchpad', 'workspace-layout']);
  });
});

describe('deepEqual', () => {
  it('compares nested values structurally', () => {
    expect(deepEqual({ a: [1, { b: 2 }] }, { a: [1, { b: 2 }] })).toBe(true);
    expect(deepEqual({ a: 1 }, { a: 1, b: undefined })).toBe(false);
    expect(deepEqual([1, 2], [2, 1])).toBe(false);
    expect(deepEqual(null, {})).toBe(false);
    expect(deepEqual([], {})).toBe(false);
  });
});

describe('merge3', () => {
  it('takes one-sided changes', () => {
    expect(merge3({ a: 1, b: 1 }, { a: 2, b: 1 }, { a: 1, b: 3 })).toEqual({ kind: 'merged', value: { a: 2, b: 3 } });
  });
  it('accepts equal changes on both sides', () => {
    expect(merge3({ a: 1 }, { a: 2 }, { a: 2 })).toEqual({ kind: 'merged', value: { a: 2 } });
  });
  it('conflicts when both change differently', () => {
    expect(merge3({ a: 1, b: 1 }, { a: 2, b: 2 }, { a: 3, b: 1 })).toEqual({ kind: 'conflict', fields: ['a'] });
  });
  it('applies the max-iso rule', () => {
    const rules = { lastActivatedAt: 'max-iso' } as const;
    const l = { n: 'x', lastActivatedAt: '2026-02-01T00:00:00.000Z' };
    const r = { n: 'x', lastActivatedAt: '2026-03-01T00:00:00.000Z' };
    expect(merge3({ n: 'x', lastActivatedAt: '2026-01-01T00:00:00.000Z' }, l, r, rules)).toEqual({ kind: 'merged', value: r });
    expect(merge3(null, r, l, rules)).toEqual({ kind: 'merged', value: r });
    // Without the rule it is a conflict.
    expect(merge3({ n: 'x', lastActivatedAt: '2026-01-01T00:00:00.000Z' }, l, r)).toEqual({ kind: 'conflict', fields: ['lastActivatedAt'] });
  });
  it('treats a null base as empty', () => {
    expect(merge3(null, { a: 1 }, { b: 2 })).toEqual({ kind: 'merged', value: { a: 1, b: 2 } });
    expect(merge3(null, { a: 1 }, { a: 2 })).toEqual({ kind: 'conflict', fields: ['a'] });
  });
  it('handles added and removed fields', () => {
    expect(merge3({ a: 1, b: 1 }, { a: 1 }, { a: 1, b: 1, c: 5 })).toEqual({ kind: 'merged', value: { a: 1, c: 5 } });
    expect(merge3({ a: 1, b: 1 }, { a: 1 }, { a: 1, b: 2 })).toEqual({ kind: 'conflict', fields: ['b'] });
  });
  it('merges non-object values only when equal', () => {
    expect(merge3('x', 'a', 'a')).toEqual({ kind: 'merged', value: 'a' });
    expect(merge3('x', 'a', 'b')).toEqual({ kind: 'conflict', fields: ['*'] });
    expect(merge3({}, { a: 1 }, 'b')).toEqual({ kind: 'conflict', fields: ['*'] });
    expect(merge3(null, [1], [2])).toEqual({ kind: 'conflict', fields: ['*'] });
  });
  it('compares nested objects deeply as a single field', () => {
    const base = { o: { x: 1, y: 1 } };
    expect(merge3(base, { o: { x: 1, y: 1 } }, { o: { x: 2, y: 1 } })).toEqual({ kind: 'merged', value: { o: { x: 2, y: 1 } } });
    expect(merge3(base, { o: { x: 2, y: 1 } }, { o: { x: 1, y: 2 } })).toEqual({ kind: 'conflict', fields: ['o'] });
  });
});

describe('coalescing with sync statuses', () => {
  const op = (over: Partial<OutboxOp>): OutboxOp => ({
    opId: 'op', environmentId: 'env', deviceId: 'dev', entityType: 'favorite', entityId: 'e1', opKind: 'upsert',
    schemaVersion: 1, basedOnRevision: 5, localRevision: 1, payload: { v: 1 }, status: 'pending',
    createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z', ...over,
  });
  for (const status of ['quarantined', 'stranded'] as const) {
    it(`a new op onto a ${status} op takes the new status and keeps basedOn/createdAt`, () => {
      const next = op({ opId: 'n', status: 'pending', basedOnRevision: 9, payload: { v: 2 }, createdAt: '2026-02-01T00:00:00.000Z' });
      expect(coalesceOutbox(op({ status }), next)).toEqual({
        ...next, basedOnRevision: 5, createdAt: '2026-01-01T00:00:00.000Z', status: 'pending',
      });
    });
  }
});

describe('stripNonSyncable', () => {
  const ok = (_t: string, k: string) => k !== 'secret';
  it('removes non-syncable keys and empty tools', () => {
    expect(stripNonSyncable({ a: { x: '1', secret: 's' }, b: { secret: 's' } }, ok)).toEqual({ a: { x: '1' } });
  });
  it('returns undefined when nothing remains or input is undefined', () => {
    expect(stripNonSyncable({ b: { secret: 's' } }, ok)).toBeUndefined();
    expect(stripNonSyncable({}, ok)).toBeUndefined();
    expect(stripNonSyncable(undefined, ok)).toBeUndefined();
  });
  it('passes toolId and key to the predicate', () => {
    expect(stripNonSyncable({ t1: { k: 'v' }, t2: { k: 'v' } }, (t) => t === 't2')).toEqual({ t2: { k: 'v' } });
  });
});
