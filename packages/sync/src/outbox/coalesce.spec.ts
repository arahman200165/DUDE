import { describe, it, expect } from 'vitest';
import { coalesceOutbox } from './coalesce.js';
import type { OutboxOp } from './outbox-op.model.js';

function op(over: Partial<OutboxOp>): OutboxOp {
  return {
    opId: 'op', environmentId: 'env', deviceId: 'dev', entityType: 'favorite', entityId: 'e1', opKind: 'upsert',
    schemaVersion: 1, basedOnRevision: null, localRevision: 1, payload: { v: 1 }, status: 'unsent-standalone',
    createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z', ...over,
  };
}

describe('coalesceOutbox', () => {
  const later = { createdAt: '2026-02-01T00:00:00.000Z', updatedAt: '2026-02-01T00:00:00.000Z' };
  const cases: Array<{ name: string; prev?: OutboxOp; next: OutboxOp; expected: OutboxOp | null }> = [
    { name: 'no previous op stores next', next: op({ opId: 'n' }), expected: op({ opId: 'n' }) },
    {
      name: 'upsert then upsert keeps latest payload, new opId, original createdAt and basedOn',
      prev: op({ opId: 'p', basedOnRevision: 4, localRevision: 1 }),
      next: op({ opId: 'n', basedOnRevision: 9, localRevision: 2, payload: { v: 2 }, ...later }),
      expected: op({ opId: 'n', basedOnRevision: 4, localRevision: 2, payload: { v: 2 }, createdAt: '2026-01-01T00:00:00.000Z', updatedAt: later.updatedAt }),
    },
    {
      name: 'unsent upsert then delete cancels when the Hub never knew the entity',
      prev: op({ basedOnRevision: null }),
      next: op({ opId: 'n', opKind: 'delete', payload: null, localRevision: 2, ...later }),
      expected: null,
    },
    {
      name: 'upsert then delete stays a delete when the Hub knows the entity',
      prev: op({ basedOnRevision: 7 }),
      next: op({ opId: 'n', opKind: 'delete', payload: null, localRevision: 2, ...later }),
      expected: op({ opId: 'n', opKind: 'delete', payload: null, localRevision: 2, basedOnRevision: 7, createdAt: '2026-01-01T00:00:00.000Z', updatedAt: later.updatedAt }),
    },
    {
      name: 'delete then upsert becomes an upsert keeping original basedOn and createdAt',
      prev: op({ opKind: 'delete', payload: null, basedOnRevision: 3 }),
      next: op({ opId: 'n', opKind: 'upsert', payload: { v: 5 }, localRevision: 3, ...later }),
      expected: op({ opId: 'n', opKind: 'upsert', payload: { v: 5 }, localRevision: 3, basedOnRevision: 3, createdAt: '2026-01-01T00:00:00.000Z', updatedAt: later.updatedAt }),
    },
    {
      name: 'delete then delete keeps the latest delete with original basedOn',
      prev: op({ opKind: 'delete', payload: null, basedOnRevision: 3 }),
      next: op({ opId: 'n', opKind: 'delete', payload: null, localRevision: 4, ...later }),
      expected: op({ opId: 'n', opKind: 'delete', payload: null, localRevision: 4, basedOnRevision: 3, createdAt: '2026-01-01T00:00:00.000Z', updatedAt: later.updatedAt }),
    },
    {
      name: 'delete (never known) then upsert is not cancelled',
      prev: op({ opKind: 'delete', payload: null, basedOnRevision: null }),
      next: op({ opId: 'n', payload: { v: 6 }, ...later }),
      expected: op({ opId: 'n', payload: { v: 6 }, basedOnRevision: null, createdAt: '2026-01-01T00:00:00.000Z', updatedAt: later.updatedAt }),
    },
  ];
  for (const c of cases) it(c.name, () => expect(coalesceOutbox(c.prev, c.next)).toEqual(c.expected));
});
