import { vi } from 'vitest';
const grants = vi.hoisted(() => ({ granted: true }));
vi.mock('../fs-grants', () => ({ isInsideGrantedRoot: () => grants.granted }));
import { beforeEach, describe, expect, it } from 'vitest';
import type { SysApplyContext, SysOpApplyResult } from '../sys-mutation';
import { addAce, formatSddl, makeAce, parseSddl, removeAce, setProtected } from '../../src/shared-logic/system/sddl';
import { ACL_OPS, daclDiffLines, isProtectedAclKey } from './acl';

const OWNER = 'O:S-1-5-21-1-2-3-1001G:S-1-5-21-1-2-3-1001';
const ORIGINAL = `${OWNER}D:AI(A;OICIID;FA;;;SY)(A;OICIID;FA;;;BA)`;
const target = { kind: 'file' as const, path: 'C:\\work\\folder' };
const def = ACL_OPS[0];

let live: string;
let calls: { method: string; params: Record<string, any> }[];
const ctx: SysApplyContext = {
  elevated: false, signal: new AbortController().signal, backup: async () => {},
  helper: async (method, raw) => {
    const params = raw as Record<string, any>;
    calls.push({ method, params });
    if (method === 'acl.get') return { ok: true, data: { sddl: live, isContainer: true } };
    if (method === 'acl.set') {
      const current = parseSddl(live);
      const given = parseSddl(params['sddl']);
      // Windows keeps the auto-inherit flag on unprotected DACLs.
      const flags = given.dacl!.flags.includes('P') ? given.dacl!.flags : [...given.dacl!.flags.filter((f) => f !== 'AI'), 'AI'];
      live = formatSddl({ owner: current.owner, group: current.group, dacl: { flags, aces: given.dacl!.aces } });
      return { ok: true, data: { sddl: live } };
    }
    return { ok: false, error: `Unexpected helper call ${method}.` };
  },
};

const users = makeAce({ sid: 'BU', mask: 0x1200a9, flags: ['OI', 'CI'] });
const afterAdd = () => formatSddl(addAce(parseSddl(ORIGINAL), users));

beforeEach(() => { live = ORIGINAL; calls = []; grants.granted = true; });

describe('acl.set-dacl validation', () => {
  const ok = { target, beforeSddl: ORIGINAL };
  it('accepts a DACL-only edit', () => {
    expect(def.validate({ ...ok, afterSddl: afterAdd() }).target).toEqual(target);
  });
  it('rejects an owner change', () => {
    expect(() => def.validate({ ...ok, afterSddl: afterAdd().replace('1001G', '1002G') })).toThrow(/owner/i);
  });
  it('rejects a group change', () => {
    expect(() => def.validate({ ...ok, afterSddl: afterAdd().replace('1001D', '1002D') })).toThrow(/group/i);
  });
  it('rejects a SACL change', () => {
    expect(() => def.validate({ target, beforeSddl: `${ORIGINAL}S:(AU;SA;FA;;;WD)`, afterSddl: afterAdd() })).toThrow(/SACL/);
    expect(() => def.validate({ target, beforeSddl: ORIGINAL, afterSddl: `${afterAdd()}S:(AU;SA;FA;;;WD)` })).toThrow(/SACL/);
  });
  it('rejects malformed, oversized and missing-DACL descriptors', () => {
    expect(() => def.validate({ ...ok, afterSddl: 'not sddl' })).toThrow(/afterSddl/);
    expect(() => def.validate({ ...ok, afterSddl: `${OWNER}D:AI(A;;FA;;;SY)${'(A;;FA;;;BA)'.repeat(6000)}` })).toThrow(/at most/);
    expect(() => def.validate({ ...ok, afterSddl: OWNER })).toThrow(/DACL/);
    expect(() => def.validate({ ...ok, afterSddl: `${OWNER}D:NO_ACCESS_CONTROL` })).toThrow(/NULL DACL|DACL/);
  });
  it('rejects unknown fields and bad targets', () => {
    expect(() => def.validate({ ...ok, afterSddl: afterAdd(), extra: 1 })).toThrow(/unknown field/);
    expect(() => def.validate({ target: { kind: 'file', path: 'relative' }, beforeSddl: ORIGINAL, afterSddl: afterAdd() })).toThrow(/absolute/);
    expect(() => def.validate({ target: { kind: 'registry', hive: 'HKXX', path: 'a', view: 'default' }, beforeSddl: ORIGINAL, afterSddl: afterAdd() })).toThrow(/hive/);
  });
  it('rejects denylisted registry keys', () => {
    for (const path of ['SAM', 'SECURITY\\Policy', 'bcd00000000\\Objects']) {
      expect(() => def.validate({ target: { kind: 'registry', hive: 'HKLM', path, view: 'default' }, beforeSddl: ORIGINAL, afterSddl: afterAdd() })).toThrow(/protected/);
    }
    expect(isProtectedAclKey('HKCU', 'SAM')).toBe(false);
    expect(isProtectedAclKey('HKLM', 'SOFTWARE\\SAMPLE')).toBe(false);
  });
  it('limits new entries to plain allow and deny ACEs, and forbids inherited entries in a protected DACL', () => {
    expect(() => def.validate({ ...ok, afterSddl: `${OWNER}D:AI(OA;;FA;bf967aba-0de6-11d0-a285-00aa003049e2;;BU)(A;OICIID;FA;;;SY)(A;OICIID;FA;;;BA)` })).toThrow(/plain allow and deny/);
    expect(() => def.validate({ ...ok, afterSddl: `${OWNER}D:P(A;OICIID;FA;;;SY)(A;OICIID;FA;;;BA)` })).toThrow(/protected DACL cannot contain inherited/);
  });
});

describe('acl.set-dacl preview and apply', () => {
  const params = () => def.validate({ target, beforeSddl: ORIGINAL, afterSddl: afterAdd() });

  it('previews SDDL before and after, the ACE diff and the child-propagation disclosure without writing', async () => {
    const preview = await def.preview(params(), ctx);
    expect(preview.blockedReason).toBeUndefined();
    expect(preview.summary).toContain('+ ALLOW');
    expect(preview.summary).toContain('(OI)(CI)');
    expect(preview.before).toContain('D:');
    expect(preview.after).toContain('(A;OICI;');
    expect(preview.warnings?.join(' ')).toMatch(/propagate inheritable entries to child objects/);
    expect(preview.noUndo).toBe(false);
    expect(calls.some((c) => c.method === 'acl.set')).toBe(false);
  });

  it('blocks a file outside a picker grant', async () => {
    grants.granted = false;
    expect((await def.preview(params(), ctx)).blockedReason).toMatch(/native file picker/);
    const applied = await def.apply(params(), { dacl: '' }, ctx);
    expect(applied.outcome).toBe('conflict');
    expect(calls.some((c) => c.method === 'acl.set')).toBe(false);
  });

  it('blocks a preview whose before no longer matches the live DACL', async () => {
    live = `${OWNER}D:AI(A;OICIID;FA;;;SY)`;
    expect((await def.preview(params(), ctx)).blockedReason).toMatch(/changed since they were loaded/);
  });

  it('blocks a no-op edit', async () => {
    const same = def.validate({ target, beforeSddl: ORIGINAL, afterSddl: ORIGINAL });
    expect((await def.preview(same, ctx)).blockedReason).toMatch(/nothing would change/);
  });

  it('reports a registry HKLM edit as needing elevation', async () => {
    const p = def.validate({ target: { kind: 'registry', hive: 'HKLM', path: 'SOFTWARE\\DudeTest', view: 'default' }, beforeSddl: ORIGINAL, afterSddl: afterAdd() });
    const preview = await def.preview(p, ctx);
    expect(preview.requiresElevation).toBe(true);
  });

  it('skips with a conflict when the DACL changed between preview and apply', async () => {
    const p = params();
    const preview = await def.preview(p, ctx);
    live = `${OWNER}D:AI(A;OICIID;FA;;;SY)(A;;FR;;;WD)`;
    const applied = await def.apply(p, preview.precondition, ctx);
    expect(applied.outcome).toBe('conflict');
    expect(calls.some((c) => c.method === 'acl.set')).toBe(false);
  });

  it('writes only the DACL and round-trips apply -> undo, with the undo previewed like any change', async () => {
    const p = params();
    const preview = await def.preview(p, ctx);
    const applied = await def.apply(p, preview.precondition, ctx) as SysOpApplyResult;
    expect(applied.outcome).toBe('applied');
    const written = calls.find((c) => c.method === 'acl.set')!;
    expect(written.params['sddl']).toMatch(/^D:/);
    expect(written.params['sddl']).not.toMatch(/O:|G:|S:/);
    expect(live).toContain('(A;OICI;0x1200a9;;;BU)');

    const undo = applied.undo!;
    expect(undo.kind).toBe('acl.set-dacl');
    const undoParams = def.validate(undo.params);
    const undoPreview = await def.preview(undoParams, ctx);
    expect(undoPreview.blockedReason).toBeUndefined();
    expect(undoPreview.summary).toContain('- ALLOW');
    const undone = await def.apply(undoParams, undoPreview.precondition, ctx);
    expect(undone.outcome).toBe('applied');
    expect(live).toBe(ORIGINAL);
  });

  it('round-trips removal of an explicit ACE and disabling inheritance with convert', async () => {
    live = `${OWNER}D:AI(A;OICI;0x1200a9;;;BU)(A;OICIID;FA;;;SY)(A;OICIID;FA;;;BA)`;
    const before = live;
    const removed = formatSddl(removeAce(parseSddl(before), 0));
    const p1 = def.validate({ target, beforeSddl: before, afterSddl: removed });
    const a1 = await def.apply(p1, (await def.preview(p1, ctx)).precondition, ctx);
    expect(a1.outcome).toBe('applied');
    expect(live).not.toContain('BU');
    const p2 = def.validate(a1.undo!.params);
    expect((await def.apply(p2, (await def.preview(p2, ctx)).precondition, ctx)).outcome).toBe('applied');
    expect(live).toBe(before);

    const protectedSddl = formatSddl(setProtected(parseSddl(before), true, 'convert'));
    const p3 = def.validate({ target, beforeSddl: before, afterSddl: protectedSddl });
    const pv = await def.preview(p3, ctx);
    expect(pv.summary).toContain('enabled -> disabled');
    const a3 = await def.apply(p3, pv.precondition, ctx);
    expect(a3.outcome).toBe('applied');
    expect(live).toMatch(/D:P/);
    expect(live).not.toMatch(/ID;/);
    const p4 = def.validate(a3.undo!.params);
    expect((await def.apply(p4, (await def.preview(p4, ctx)).precondition, ctx)).outcome).toBe('applied');
    expect(live).toBe(before);
  });

  it('surfaces access denied with a hint', async () => {
    const denied: SysApplyContext = { ...ctx, helper: async (method, raw) => method === 'acl.set' ? { ok: false, error: 'Access is denied.', code: 5 } : ctx.helper(method, raw) };
    const p = params();
    const applied = await def.apply(p, (await def.preview(p, ctx)).precondition, denied);
    expect(applied).toMatchObject({ outcome: 'failed' });
    expect(applied.message).toMatch(/elevated|Change permissions/);
  });
});

describe('daclDiffLines', () => {
  it('lists removed then added entries in icacls notation', () => {
    const lines = daclDiffLines(parseSddl(`${OWNER}D:(A;;FA;;;SY)`), parseSddl(`${OWNER}D:(A;OICI;0x1200a9;;;BU)`));
    expect(lines[0]).toMatch(/^- ALLOW .*F/);
    expect(lines[1]).toMatch(/^\+ ALLOW .*RX (?:\(OI\)\(CI\))/);
  });
});
