import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { MAX_BATCH, MAX_VALUE_BYTES, validateEntityBatch, validateEntityCommit, validateKvBatch, validateKvMutation } from './store-validation';

const kv = (over: Record<string, unknown> = {}) => ({ namespace: 'json-formatter', key: 'input', value: 'x', policy: 'local', ...over });

function sourceFiles(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) sourceFiles(path, out);
    else if (path.endsWith('.ts') && !path.endsWith('.spec.ts')) out.push(path);
  }
  return out;
}

describe('kv validation', () => {
  it('accepts representative namespaces, keys and policies', () => {
    for (const namespace of ['json-formatter', '__favorites__', 'settings', 'user-scripts', '__home-layout__', 'base64', 'a.b_c-d']) {
      expect(validateKvMutation(kv({ namespace })).ok).toBe(true);
    }
    for (const key of ['input', 'pinned', 'openCategories', 'a:b', 'v1.2', 'view-mode']) expect(validateKvMutation(kv({ key })).ok).toBe(true);
    for (const policy of ['none', 'session', 'local', 'user-choice']) expect(validateKvMutation(kv({ policy })).ok).toBe(true);
  });

  it('accepts every literal namespace and key the renderer passes to persistence.signal()', () => {
    const root = resolve(__dirname, '../../web/src/app');
    const pattern = /persistence\.signal(?:<[^()]*>)?\(\s*['"]([^'"]+)['"]\s*,\s*['"]([^'"]+)['"]/g;
    let seen = 0;
    for (const file of sourceFiles(root)) {
      const text = readFileSync(file, 'utf8');
      for (const match of text.matchAll(pattern)) {
        seen++;
        expect(validateKvMutation(kv({ namespace: match[1], key: match[2] })), `${match[1]}/${match[2]} in ${file}`).toMatchObject({ ok: true });
      }
    }
    expect(seen).toBeGreaterThan(20);
  });

  it('rejects bad namespaces and keys', () => {
    for (const namespace of ['', 'a b', 'a/b', '../x', 'x'.repeat(65), 'é', 42, undefined]) expect(validateKvMutation(kv({ namespace })).ok).toBe(false);
    for (const key of ['', 'a b', 'a/b', 'x'.repeat(129), 7, undefined]) expect(validateKvMutation(kv({ key })).ok).toBe(false);
  });

  it('rejects secure-local and unknown policies', () => {
    for (const policy of ['secure-local', 'forever', '', undefined, 1]) expect(validateKvMutation(kv({ policy })).ok).toBe(false);
  });

  it('caps value size and rejects non-serializable values', () => {
    expect(validateKvMutation(kv({ value: 'x'.repeat(MAX_VALUE_BYTES - 2) })).ok).toBe(true);
    expect(validateKvMutation(kv({ value: 'x'.repeat(MAX_VALUE_BYTES) })).ok).toBe(false);
    const cyclic: Record<string, unknown> = {};
    cyclic['self'] = cyclic;
    expect(validateKvMutation(kv({ value: cyclic })).ok).toBe(false);
  });

  it('keeps only known fields and honours remove', () => {
    const result = validateKvMutation(kv({ remove: true, value: 'ignored', extra: 1 }));
    expect(result).toEqual({ ok: true, value: { namespace: 'json-formatter', key: 'input', policy: 'local', remove: true } });
  });

  it('caps the batch and validates every item', () => {
    expect(validateKvBatch(Array.from({ length: MAX_BATCH }, () => kv())).ok).toBe(true);
    expect(validateKvBatch(Array.from({ length: MAX_BATCH + 1 }, () => kv())).ok).toBe(false);
    expect(validateKvBatch([kv(), kv({ key: 'bad key' })]).ok).toBe(false);
    expect(validateKvBatch('nope').ok).toBe(false);
    expect(validateKvBatch([null]).ok).toBe(false);
  });
});

describe('entity validation', () => {
  it('accepts a known entity type', () => {
    expect(validateEntityCommit({ entityType: 'favorite', entityId: 'json-formatter', op: 'upsert', payload: { a: 1 } }).ok).toBe(true);
    expect(validateEntityCommit({ entityType: 'favorite', entityId: 'json-formatter', op: 'delete' }).ok).toBe(true);
  });

  it('rejects unknown types, prototype names, bad ids and ops', () => {
    for (const entityType of ['nope', 'toString', '__proto__', '', 5]) expect(validateEntityCommit({ entityType, entityId: 'x', op: 'upsert' }).ok).toBe(false);
    for (const entityId of ['', 'x'.repeat(201), 3]) expect(validateEntityCommit({ entityType: 'favorite', entityId, op: 'upsert' }).ok).toBe(false);
    for (const op of ['merge', '', undefined]) expect(validateEntityCommit({ entityType: 'favorite', entityId: 'x', op }).ok).toBe(false);
  });

  it('caps payload size and batch length', () => {
    expect(validateEntityCommit({ entityType: 'favorite', entityId: 'x', op: 'upsert', payload: 'x'.repeat(MAX_VALUE_BYTES) }).ok).toBe(false);
    expect(validateEntityBatch(Array.from({ length: MAX_BATCH + 1 }, () => ({ entityType: 'favorite', entityId: 'x', op: 'upsert' }))).ok).toBe(false);
  });
});
