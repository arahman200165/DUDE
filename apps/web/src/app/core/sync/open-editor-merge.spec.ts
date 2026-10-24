import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { OpenEditorMerge } from './open-editor-merge';
import { RemoteChangesService } from './remote-changes.service';

interface Doc {
  id: string;
  name: string;
  size: number;
  updatedAt: string;
}

describe('OpenEditorMerge', () => {
  const base: Doc = { id: 'd1', name: 'Base', size: 1, updatedAt: '2026-01-01T00:00:00.000Z' };

  function setup() {
    TestBed.configureTestingModule({});
    const stored = signal<Doc | null>(base);
    const draft = signal<Doc>(base);
    const id = signal<string | null>('d1');
    const merge = TestBed.runInInjectionContext(
      () => new OpenEditorMerge<Doc>({ entityType: 'user-script', entityId: id, stored, draft, setDraft: (v) => draft.set(v) }),
    );
    const remoteChanges = TestBed.inject(RemoteChangesService);
    let at = 1;
    const changed = (entityId = 'd1') => {
      remoteChanges.apply([{ entityType: 'user-script', entityId, deleted: false, payload: null }], at++);
      TestBed.tick();
    };
    return { merge, stored, draft, id, changed };
  }

  it('adopts a remote change when the draft has no edits, even if only updatedAt differs', () => {
    const { merge, stored, draft, changed } = setup();
    draft.set({ ...base, updatedAt: '2025-12-01T00:00:00.000Z' });
    stored.set({ ...base, name: 'Theirs', updatedAt: '2026-02-01T00:00:00.000Z' });
    changed();
    expect(draft().name).toBe('Theirs');
    expect(merge.notice()).toBeNull();
  });

  it('merges disjoint edits and rebases onto the remote value', () => {
    const { merge, stored, draft, changed } = setup();
    draft.set({ ...base, name: 'Mine' });
    stored.set({ ...base, size: 9, updatedAt: '2026-02-01T00:00:00.000Z' });
    changed();
    expect(draft()).toMatchObject({ name: 'Mine', size: 9 });
    expect(merge.notice()).toBeNull();
    // The base is now the remote value: a second remote edit of the field only this side changed is a conflict.
    stored.set({ ...stored()!, name: 'Theirs', updatedAt: '2026-03-01T00:00:00.000Z' });
    changed();
    expect(draft()).toMatchObject({ name: 'Mine', size: 9 });
    expect(merge.notice()).toBe('conflict');
  });

  it('keeps the draft on a conflict; useRemote drops it, dismiss keeps the old base', () => {
    const { merge, stored, draft, changed } = setup();
    draft.set({ ...base, name: 'Mine' });
    stored.set({ ...base, name: 'Theirs' });
    changed();
    expect(merge.notice()).toBe('conflict');
    expect(draft().name).toBe('Mine');

    merge.dismiss();
    expect(merge.notice()).toBeNull();
    changed();
    expect(merge.notice()).toBe('conflict');

    merge.useRemote();
    expect(draft().name).toBe('Theirs');
    expect(merge.notice()).toBeNull();
  });

  it('keeps the draft and says so when the entity was deleted elsewhere', () => {
    const { merge, stored, draft, changed } = setup();
    draft.set({ ...base, name: 'Mine' });
    stored.set(null);
    changed();
    expect(merge.notice()).toBe('deleted');
    expect(draft().name).toBe('Mine');
  });

  it('ignores changes to other entities and a first save that assigns the id', () => {
    const { merge, stored, draft, id, changed } = setup();
    draft.set({ ...base, name: 'Mine' });
    stored.set({ ...base, name: 'Theirs' });
    changed('other');
    expect(merge.notice()).toBeNull();

    id.set(null);
    TestBed.tick();
    id.set('d1');
    TestBed.tick();
    expect(merge.notice()).toBeNull();
  });

  it('markSaved sets the new base and clears the notice', () => {
    const { merge, stored, draft, changed } = setup();
    draft.set({ ...base, name: 'Mine' });
    stored.set({ ...base, name: 'Theirs' });
    changed();
    expect(merge.notice()).toBe('conflict');
    const saved = { ...base, name: 'Mine' };
    stored.set(saved);
    merge.markSaved(saved);
    expect(merge.notice()).toBeNull();
  });
});
