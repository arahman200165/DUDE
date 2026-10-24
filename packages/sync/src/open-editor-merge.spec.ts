import { describe, it, expect } from 'vitest';
import { mergeIntoOpenEditor } from './open-editor-merge.js';

const script = { id: 's1', name: 'Trim', body: 'return 1;', timeoutMs: 1000 };

describe('mergeIntoOpenEditor', () => {
  it('does nothing when the remote value is what the editor started from', () => {
    expect(mergeIntoOpenEditor('user-script', script, { ...script, name: 'Mine' }, { ...script })).toEqual({ kind: 'unchanged' });
  });

  it('adopts the remote value, without a notice, when the draft is unchanged', () => {
    const remote = { ...script, name: 'Theirs' };
    expect(mergeIntoOpenEditor('user-script', script, { ...script }, remote)).toEqual({ kind: 'adopt', value: remote });
  });

  it('merges edits to different fields and keeps both', () => {
    const result = mergeIntoOpenEditor('user-script', script, { ...script, name: 'Mine' }, { ...script, timeoutMs: 5000 });
    expect(result).toEqual({ kind: 'merged', value: { ...script, name: 'Mine', timeoutMs: 5000 } });
  });

  it('conflicts when both sides changed the same field, leaving the choice to the caller', () => {
    const result = mergeIntoOpenEditor('user-script', script, { ...script, name: 'Mine' }, { ...script, name: 'Theirs' });
    expect(result).toEqual({ kind: 'conflict', fields: ['name'] });
  });

  it('accepts the same edit made on both sides', () => {
    const result = mergeIntoOpenEditor('user-script', script, { ...script, name: 'Same' }, { ...script, name: 'Same' });
    expect(result).toEqual({ kind: 'merged', value: { ...script, name: 'Same' } });
  });

  it('applies the entity field rules: a max-iso field resolves to the later time', () => {
    const base = { id: 'p', name: 'P', lastActivatedAt: '2026-01-01T00:00:00.000Z' };
    const draft = { ...base, lastActivatedAt: '2026-02-01T00:00:00.000Z' };
    const remote = { ...base, lastActivatedAt: '2026-03-01T00:00:00.000Z' };
    expect(mergeIntoOpenEditor('project', base, draft, remote)).toEqual({ kind: 'merged', value: remote });
    expect(mergeIntoOpenEditor('project', base, remote, draft)).toEqual({ kind: 'merged', value: remote });
    // The same shape on an entity without that rule is a conflict.
    expect(mergeIntoOpenEditor('pipeline', base, draft, remote)).toEqual({ kind: 'conflict', fields: ['lastActivatedAt'] });
  });

  it('keeps the draft and reports a deletion made elsewhere', () => {
    expect(mergeIntoOpenEditor('user-script', script, { ...script, name: 'Mine' }, null)).toEqual({ kind: 'deleted' });
  });

  it('reports a clean merge the editor cannot hold as a conflict', () => {
    const result = mergeIntoOpenEditor('user-script', script, { ...script, name: 'Mine' }, { ...script, timeoutMs: 5000 }, { accept: () => false });
    expect(result).toEqual({ kind: 'conflict', fields: ['*'] });
  });

  it('does not count bookkeeping fields or undefined keys as edits', () => {
    const base = { id: 'p', name: 'P', updatedAt: '2026-01-01T00:00:00.000Z', steps: [{ stepId: 'a', label: 'x' }] };
    // The draft carries an older updatedAt and an in-memory `undefined` label, as an editor's own copy does after a save.
    const draft = { ...base, updatedAt: '2025-12-31T00:00:00.000Z', steps: [{ stepId: 'a', label: 'x', extra: undefined }] };
    const remote = { ...base, name: 'Theirs', updatedAt: '2026-02-01T00:00:00.000Z' };
    expect(mergeIntoOpenEditor('pipeline', base, draft, remote, { ignore: ['updatedAt'] })).toEqual({ kind: 'adopt', value: remote });
    const edited = { ...draft, description: 'Mine' };
    expect(mergeIntoOpenEditor('pipeline', base, edited, remote, { ignore: ['updatedAt'] })).toEqual({
      kind: 'merged',
      value: { ...remote, description: 'Mine' },
    });
  });

  it('treats an editor with no stored base as a full three-way merge against an empty base', () => {
    expect(mergeIntoOpenEditor('user-script', null, { ...script }, { ...script })).toEqual({ kind: 'merged', value: script });
    expect(mergeIntoOpenEditor('user-script', null, { ...script, name: 'A' }, { ...script, name: 'B' })).toEqual({ kind: 'conflict', fields: ['name'] });
  });
});
