import { describe, expect, it } from 'vitest';
import { RecordBook, SYNC_POLICIES, buildOp, canKeepBoth, forkPayload, resolveBrowserConflict, toAppliedChange, settingPayload, splitSettingId } from '../index.js';

describe('RecordBook', () => {
  it('keeps the newest revision and the matching base', () => {
    const book = new RecordBook();
    expect(book.get('pipeline', 'a')).toEqual({ revision: null, base: null });
    expect(book.note('pipeline', 'a', 3, { x: 1 })).toBe(true);
    expect(book.note('pipeline', 'a', 2, { x: 0 })).toBe(false);
    expect(book.get('pipeline', 'a')).toEqual({ revision: 3, base: { x: 1 } });
  });
  it('keeps a tombstone revision and stops listing it as live', () => {
    const book = new RecordBook();
    book.note('pipeline', 'a', 1, { x: 1 });
    book.noteRecord({ entityType: 'pipeline', entityId: 'a', revision: 4, deleted: true, payload: null });
    expect(book.get('pipeline', 'a')).toEqual({ revision: 4, base: null });
    expect(book.liveIds('pipeline')).toEqual([]);
    expect(book.isStale({ entityType: 'pipeline', entityId: 'a', revision: 4, deleted: true, payload: null })).toBe(true);
    expect(book.isStale({ entityType: 'pipeline', entityId: 'a', revision: 5, deleted: false, payload: {} })).toBe(false);
  });
  it('lists live ids and keys', () => {
    const book = new RecordBook();
    book.note('favorite', 'f1', 1, {});
    book.note('pipeline', 'p1', 2, {});
    expect(book.liveIds('favorite')).toEqual(['f1']);
    expect(book.liveKeys()).toHaveLength(2);
    book.clear();
    expect(book.liveKeys()).toEqual([]);
  });
});

describe('ops', () => {
  it('builds upserts and deletes like the Agent', () => {
    const up = buildOp({ opId: 'o1', entityType: 'pipeline', entityId: 'p', schemaVersion: 1, basedOnRevision: 4, payload: { id: 'p' } });
    expect(up).toEqual({ opId: 'o1', entityType: 'pipeline', entityId: 'p', opKind: 'upsert', schemaVersion: 1, basedOnRevision: 4, payload: { id: 'p' } });
    const del = buildOp({ opId: 'o2', entityType: 'pipeline', entityId: 'p', schemaVersion: 1, basedOnRevision: null, payload: null });
    expect(del.opKind).toBe('delete');
    expect(del.payload).toBeNull();
  });
  it('splits setting ids and maps records to applied changes', () => {
    expect(splitSettingId('git:mode:x')).toEqual({ namespace: 'git', key: 'mode:x' });
    expect(splitSettingId('nocolon')).toBeUndefined();
    const change = toAppliedChange({ entityType: 'setting', entityId: 'a:b', deleted: false, payload: settingPayload('a', 'b', 7) });
    expect(change).toMatchObject({ namespace: 'a', key: 'b', value: 7, deleted: false });
    expect(toAppliedChange({ entityType: 'setting', entityId: 'a:b', deleted: true, payload: null })).toMatchObject({ deleted: true, payload: null });
    expect(toAppliedChange({ entityType: 'pipeline', entityId: 'p', deleted: false, payload: { a: 1 } }).namespace).toBeUndefined();
  });
});

describe('resolveBrowserConflict', () => {
  const merge = SYNC_POLICIES.pipeline;
  it('re-commits mine for lww and per-device policies', () => {
    expect(resolveBrowserConflict({ policy: SYNC_POLICIES.favorite, base: {}, mine: { a: 1 }, theirs: { a: 2 } })).toEqual({ kind: 'take-mine' });
    expect(resolveBrowserConflict({ policy: SYNC_POLICIES.usage, base: null, mine: { a: 1 }, theirs: null })).toEqual({ kind: 'take-mine' });
  });
  it('merges non-overlapping edits', () => {
    const r = resolveBrowserConflict({ policy: merge, base: { a: 1, b: 1 }, mine: { a: 2, b: 1 }, theirs: { a: 1, b: 3 } });
    expect(r).toEqual({ kind: 'merged', payload: { a: 2, b: 3 }, matchesHub: false });
  });
  it('flags a merge that adds nothing to the Hub version', () => {
    const r = resolveBrowserConflict({ policy: merge, base: { a: 1 }, mine: { a: 1 }, theirs: { a: 2 } });
    expect(r).toMatchObject({ kind: 'merged', matchesHub: true });
  });
  it('reports overlapping field edits as a conflict', () => {
    expect(resolveBrowserConflict({ policy: merge, base: { a: 1 }, mine: { a: 2 }, theirs: { a: 3 } })).toEqual({ kind: 'conflict', fields: ['a'] });
  });
  it('treats edit-vs-delete as a conflict and double delete as mine', () => {
    expect(resolveBrowserConflict({ policy: merge, base: { a: 1 }, mine: { a: 2 }, theirs: null })).toEqual({ kind: 'conflict', fields: ['*'] });
    expect(resolveBrowserConflict({ policy: merge, base: { a: 1 }, mine: null, theirs: { a: 2 } })).toEqual({ kind: 'conflict', fields: ['*'] });
    expect(resolveBrowserConflict({ policy: merge, base: { a: 1 }, mine: null, theirs: null })).toEqual({ kind: 'take-mine' });
  });
  it('applies field rules (max-iso)', () => {
    const r = resolveBrowserConflict({ policy: SYNC_POLICIES.project, base: { lastActivatedAt: '2024-01-01' }, mine: { lastActivatedAt: '2024-03-01' }, theirs: { lastActivatedAt: '2024-02-01' } });
    expect(r).toMatchObject({ kind: 'merged', payload: { lastActivatedAt: '2024-03-01' } });
  });
});

describe('keep both', () => {
  it('forks with a new id and a suffixed name', () => {
    expect(forkPayload({ id: 'a', name: 'Nice', x: 1 }, 'b')).toEqual({ id: 'b', name: 'Nice (conflict copy)', x: 1 });
    expect(forkPayload(null, 'b')).toBeNull();
    expect(forkPayload({ x: 1 }, 'b')).toEqual({ x: 1 });
  });
  it('is not offered for singletons, settings, favorites or usage', () => {
    for (const t of ['home-layout', 'scratchpad', 'workspace-layout', 'setting', 'favorite', 'usage']) expect(canKeepBoth(t)).toBe(false);
    expect(canKeepBoth('pipeline')).toBe(true);
  });
});
