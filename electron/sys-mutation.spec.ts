import { beforeEach, describe, expect, it, vi } from 'vitest';
import { existsSync, mkdtempSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const mock = vi.hoisted(() => ({ userData: '', elevated: false }));
vi.mock('electron', () => ({
  app: { getPath: () => mock.userData },
  ipcMain: { handle: vi.fn() },
}));
vi.mock('./sys-helper', () => ({
  sysHelper: () => ({
    call: async (method: string) => (method === 'helper.info' ? { ok: true, data: { elevated: mock.elevated } } : { ok: false, error: 'nope' }),
  }),
}));

import {
  applySystemPlan, cancelSystemApply, discardSystemPlan, issueSystemToken, listSystemJournal, planSystemChange, planSystemUndo,
  pruneSystemBackups, registerSysOp, resetSysOpsForTesting, setSysMutationRootForTesting, setSysSettings, sysOpKinds,
  type SysOpDefinition,
} from './sys-mutation';

const owner = { id: 1, send: vi.fn(), isDestroyed: () => false };
const other = { id: 2, send: vi.fn(), isDestroyed: () => false };

let state: Map<string, string>;
const calls = { apply: 0, preview: 0 };
let afterFirstOp: (() => void) | null = null;

const setOp: SysOpDefinition<{ key: string; value: string | null }> = {
  kind: 'test.set',
  validate(raw) {
    const r = raw as { key?: unknown; value?: unknown };
    if (typeof r?.key !== 'string' || !(typeof r.value === 'string' || r.value === null)) throw new Error('bad params');
    return { key: r.key, value: r.value };
  },
  async preview(p) {
    calls.preview++;
    return { target: p.key, summary: 'Set', before: state.get(p.key), after: p.value ?? '(deleted)', requiresElevation: false, noUndo: false, precondition: state.get(p.key) ?? null };
  },
  async apply(p, pre, ctx) {
    calls.apply++;
    const current = state.get(p.key) ?? null;
    if (current !== pre) return { outcome: 'conflict', message: 'changed' };
    await ctx.backup(`${p.key}.txt`, current ?? '');
    if (p.value === null) state.delete(p.key); else state.set(p.key, p.value);
    afterFirstOp?.();
    return { outcome: 'applied', before: current ?? undefined, after: p.value ?? undefined, undo: { kind: 'test.set', params: { key: p.key, value: current } } };
  },
};
const simple = (kind: string, extra: Partial<SysOpDefinition<unknown>> & { preview?: Record<string, unknown> } = {}): SysOpDefinition<unknown> => ({
  kind,
  validate: (raw) => raw,
  preview: async () => ({ target: kind, summary: kind, requiresElevation: false, noUndo: false, precondition: null, ...extra.preview }),
  apply: extra.apply ?? (async () => { calls.apply++; return { outcome: 'applied' as const }; }),
});

function request(ops: { kind: string; params?: unknown }[], title = 'Test') {
  return { tool: 'spec', title, ops: ops.map((op) => ({ kind: op.kind, params: op.params ?? {} })) };
}
const set = (key: string, value: string | null) => ({ kind: 'test.set', params: { key, value } });

async function confirm(planId: string, typed: string[] = [], who = owner, options = {}) {
  const issued = issueSystemToken(who.id, planId, typed);
  if (!issued.ok) throw new Error(issued.error);
  return applySystemPlan(who, planId, issued.token, options);
}

beforeEach(() => {
  mock.userData = mkdtempSync(join(tmpdir(), 'dude-sysmut-'));
  mock.elevated = false;
  setSysMutationRootForTesting(mock.userData);
  state = new Map([['a', '1']]);
  calls.apply = 0; calls.preview = 0; afterFirstOp = null;
  owner.send.mockClear();
  resetSysOpsForTesting();
  registerSysOp(setOp);
  registerSysOp(simple('test.critical', { preview: { typedConfirm: 'PROD-DB', target: 'db' } }));
  registerSysOp(simple('test.admin', { preview: { requiresElevation: true } }));
  registerSysOp(simple('test.oneway', { preview: { noUndo: true } }));
  registerSysOp(simple('test.throws', { apply: async () => { throw new Error('boom'); } }));
  registerSysOp(simple('test.blocked', { preview: { blockedReason: 'Protected target.' } }));
});

describe('op registry', () => {
  it('rejects duplicate and malformed kinds', () => {
    expect(() => registerSysOp(setOp)).toThrow(/already registered/);
    expect(() => registerSysOp({ ...setOp, kind: 'Bad Kind' })).toThrow(/Invalid/);
    expect(sysOpKinds()).toContain('test.set');
  });
});

describe('planning', () => {
  it('previews without applying anything', async () => {
    const preview = await planSystemChange(owner, request([set('a', '2')]));
    expect(calls.apply).toBe(0);
    expect(state.get('a')).toBe('1');
    expect(preview.ops[0]).toMatchObject({ target: 'a', before: '1', after: '2' });
    expect(preview.blocked).toEqual([]);
  });

  it('validates the request strictly', async () => {
    await expect(planSystemChange(owner, null)).rejects.toThrow();
    await expect(planSystemChange(owner, { tool: 'x', title: 't', ops: [] })).rejects.toThrow();
    await expect(planSystemChange(owner, { tool: 'x'.repeat(101), title: 't', ops: [set('a', 'b')] })).rejects.toThrow();
    await expect(planSystemChange(owner, { tool: 'x', title: 't'.repeat(201), ops: [set('a', 'b')] })).rejects.toThrow();
    await expect(planSystemChange(owner, request([{ kind: 'nope.kind' }]))).rejects.toThrow('Unknown system change: nope.kind');
    await expect(planSystemChange(owner, request([{ kind: 'test.set', params: { key: 1 } }]))).rejects.toThrow('bad params');
  });

  it('collects typed confirmations and the no-undo flag', async () => {
    const preview = await planSystemChange(owner, request([{ kind: 'test.critical' }, { kind: 'test.critical' }, { kind: 'test.oneway' }]));
    expect(preview.typedConfirm).toEqual(['PROD-DB']);
    expect(preview.noUndo).toBe(true);
  });
});

describe('confirmation contract', () => {
  it('rejects apply without a token, with a reused token, for another owner, and after tampering', async () => {
    const preview = await planSystemChange(owner, request([set('a', '2')]));
    await expect(applySystemPlan(owner, preview.planId, undefined)).rejects.toThrow(/Confirm this change/);
    await expect(applySystemPlan(owner, preview.planId, 'made-up')).rejects.toThrow(/expired or the plan changed/);
    const issued = issueSystemToken(owner.id, preview.planId, []);
    if (!issued.ok) throw new Error(issued.error);
    await expect(applySystemPlan(other, preview.planId, issued.token)).rejects.toThrow(/expired or the plan changed/);
    // the wrong-owner attempt burned the token
    await expect(applySystemPlan(owner, preview.planId, issued.token)).rejects.toThrow();
    expect(calls.apply).toBe(0);
    expect(issueSystemToken(other.id, preview.planId, [])).toMatchObject({ ok: false });

    const result = await confirm(preview.planId);
    expect(result.applied).toBe(1);
    const again = issueSystemToken(owner.id, preview.planId, []);
    expect(again.ok).toBe(false);
  });

  it('rejects an expired token', async () => {
    vi.useFakeTimers();
    try {
      const preview = await planSystemChange(owner, request([set('a', '2')]));
      const issued = issueSystemToken(owner.id, preview.planId, []);
      if (!issued.ok) throw new Error(issued.error);
      vi.advanceTimersByTime(61_000);
      await expect(applySystemPlan(owner, preview.planId, issued.token)).rejects.toThrow(/expired or the plan changed/);
    } finally { vi.useRealTimers(); }
    expect(state.get('a')).toBe('1');
  });

  it('discarded plans cannot be confirmed', async () => {
    const preview = await planSystemChange(owner, request([set('a', '2')]));
    expect(discardSystemPlan(other.id, preview.planId)).toBe(false);
    expect(discardSystemPlan(owner.id, preview.planId)).toBe(true);
    expect(issueSystemToken(owner.id, preview.planId, []).ok).toBe(false);
  });

  it('enforces typed confirmation case-insensitively', async () => {
    const preview = await planSystemChange(owner, request([{ kind: 'test.critical' }]));
    const message = 'Type the exact name of each critical target to confirm.';
    expect(issueSystemToken(owner.id, preview.planId, [])).toEqual({ ok: false, error: message });
    expect(issueSystemToken(owner.id, preview.planId, 'PROD-DB')).toEqual({ ok: false, error: message });
    expect(issueSystemToken(owner.id, preview.planId, ['prod-dbx'])).toEqual({ ok: false, error: message });
    expect(issueSystemToken(owner.id, preview.planId, [' prod-db '])).toMatchObject({ ok: true });
  });

  it('blocks plans that need elevation and plans with blocked reasons', async () => {
    const preview = await planSystemChange(owner, request([{ kind: 'test.admin' }]));
    expect(preview.blocked).toEqual([{ index: 0, reason: 'Needs an elevated session. Relaunch DUDE as Administrator.' }]);
    expect(issueSystemToken(owner.id, preview.planId, [])).toEqual({ ok: false, error: 'This plan has changes that cannot be applied in this session.' });
    const blocked = await planSystemChange(owner, request([{ kind: 'test.blocked' }]));
    expect(blocked.blocked[0].reason).toBe('Protected target.');

    mock.elevated = true;
    const elevated = await planSystemChange(owner, request([{ kind: 'test.admin' }]));
    expect(elevated.blocked).toEqual([]);
    expect((await confirm(elevated.planId)).applied).toBe(1);
  });

  it('requires acknowledging changes that cannot be undone', async () => {
    const preview = await planSystemChange(owner, request([{ kind: 'test.oneway' }]));
    await expect(confirm(preview.planId)).rejects.toThrow(/cannot be undone/);
    expect(calls.apply).toBe(0);
    const result = await confirm(preview.planId, [], owner, { acceptNoUndo: true });
    expect(result.applied).toBe(1);
  });
});

describe('applying', () => {
  it('reports a conflict when live state changed after the preview', async () => {
    const preview = await planSystemChange(owner, request([set('a', '2')]));
    state.set('a', 'changed-elsewhere');
    const result = await confirm(preview.planId);
    expect(result).toMatchObject({ applied: 0, conflicts: 1 });
    expect(state.get('a')).toBe('changed-elsewhere');
  });

  it('records a thrown op as failed and still runs later ops', async () => {
    const preview = await planSystemChange(owner, request([{ kind: 'test.throws' }, set('a', '9')]));
    const result = await confirm(preview.planId);
    expect(result).toMatchObject({ applied: 1, failed: 1 });
    expect(result.journal.ops[0]).toMatchObject({ outcome: 'failed', message: 'boom' });
    expect(state.get('a')).toBe('9');
  });

  it('cancels the remaining ops', async () => {
    const preview = await planSystemChange(owner, request([set('a', '2'), set('b', '3'), set('c', '4')]));
    afterFirstOp = () => { afterFirstOp = null; expect(cancelSystemApply(preview.planId)).toBe(true); };
    const result = await confirm(preview.planId);
    expect(result.journal.ops.map((op) => op.outcome)).toEqual(['applied', 'cancelled', 'cancelled']);
    expect(state.has('b')).toBe(false);
    expect(cancelSystemApply(preview.planId)).toBe(false);
  });

  it('sends progress and journals per-op outcomes with backups', async () => {
    const preview = await planSystemChange(owner, request([set('a', '2'), { kind: 'test.throws' }]));
    const result = await confirm(preview.planId);
    expect(owner.send).toHaveBeenCalledWith('dude:sysmut:progress', { planId: preview.planId, done: 2, total: 2 });
    const [entry] = await listSystemJournal();
    expect(entry.planId).toBe(preview.planId);
    expect(entry.ops.map((op) => op.outcome)).toEqual(['applied', 'failed']);
    expect(entry.ops[0]).toMatchObject({ kind: 'test.set', target: 'a', before: '1', after: '2' });
    expect(entry.backupBytes).toBe(1);
    expect(result.journal.planId).toBe(entry.planId);
    expect(readdirSync(join(mock.userData, 'sys-backups', preview.planId))).toEqual(['0-a.txt']);
  });
});

describe('undo', () => {
  it('round trips through a previewed plan and marks the original undone', async () => {
    const preview = await planSystemChange(owner, request([set('a', '2'), set('b', '3')]));
    await confirm(preview.planId);
    expect(Object.fromEntries(state)).toEqual({ a: '2', b: '3' });

    const undo = await planSystemUndo(owner, preview.planId);
    expect(undo.title).toBe('Undo: Test');
    expect(undo.undoOf).toBe(preview.planId);
    expect(undo.ops.map((op) => op.target)).toEqual(['b', 'a']);
    expect(Object.fromEntries(state)).toEqual({ a: '2', b: '3' });
    await confirm(undo.planId);
    expect(Object.fromEntries(state)).toEqual({ a: '1' });

    const journal = await listSystemJournal();
    expect(journal.find((e) => e.planId === preview.planId)?.undoneBy).toBe(undo.planId);
    await expect(planSystemUndo(owner, preview.planId)).rejects.toThrow('This change was already undone.');
  });

  it('rejects unknown ids and changes with nothing undoable', async () => {
    await expect(planSystemUndo(owner, 'not-an-id')).rejects.toThrow('That change is no longer in the journal.');
    const preview = await planSystemChange(owner, request([{ kind: 'test.oneway' }]));
    await confirm(preview.planId, [], owner, { acceptNoUndo: true });
    await expect(planSystemUndo(owner, preview.planId)).rejects.toThrow('Nothing in this change can be undone.');
  });
});

describe('retention', () => {
  it('prunes backups past the retention window but keeps the journal', async () => {
    const preview = await planSystemChange(owner, request([set('a', '2')]));
    await confirm(preview.planId);
    const dir = join(mock.userData, 'sys-backups', preview.planId);
    expect(existsSync(dir)).toBe(true);
    await pruneSystemBackups(Date.now() + 31 * 86_400_000);
    expect(existsSync(dir)).toBe(false);
    const [entry] = await listSystemJournal();
    expect(entry.backupsPruned).toBe(true);
  });

  it('prunes oldest backups over the byte cap and sanitizes settings', async () => {
    const first = await planSystemChange(owner, request([set('a', '2')]));
    await confirm(first.planId);
    expect(await setSysSettings({ retentionDays: 99999, maxBackupBytes: -5 })).toEqual({ retentionDays: 3650, maxBackupBytes: 0 });
    expect(existsSync(join(mock.userData, 'sys-backups', first.planId))).toBe(false);
    expect(await setSysSettings({ retentionDays: 0 })).toMatchObject({ retentionDays: 1 });
  });
});
