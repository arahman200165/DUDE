import { TestBed } from '@angular/core/testing';
import { HubAdminError, type HubAdminPort } from '../../../core/hub/hub-admin.port';
import { HUB_ADMIN } from '../../../core/hub/hub-admin.token';
import {
  COLLAB_HISTORY_CONSENT_MESSAGE, CollabHistoryDrawer, collabSnippetsPreview, collabTextPreview, relativeTimeLabel,
  type CollabHistoryPreviewFn, type CollabHistoryPreviewKind,
} from './collab-history-drawer';

const NOW = Date.parse('2026-10-24T12:00:00.000Z');
const OLD = { id: 'snap_old', takenAt: '2026-10-24T09:00:00.000Z', bytes: 2048 };
const NEW = { id: 'snap_new', takenAt: '2026-10-24T11:55:00.000Z', bytes: 12 };
const PAYLOADS: Record<string, Record<string, unknown>> = {
  snap_new: { body: 'return 2;', name: 'Script' },
  snap_old: { body: 'return 1;', name: 'Script' },
};

function fakeAdmin(overrides: Partial<HubAdminPort> = {}) {
  return {
    listCollabHistory: vi.fn(async () => ({ snapshots: [OLD, NEW] })),
    getCollabSnapshot: vi.fn(async (id: string) => ({ doc: 'user-script:s1', takenAt: id === OLD.id ? OLD.takenAt : NEW.takenAt, payload: PAYLOADS[id] ?? {} })),
    restoreCollabSnapshot: vi.fn(async () => ({ ok: true as const })),
    ...overrides,
  };
}

async function render(options: { admin?: ReturnType<typeof fakeAdmin>; kind?: CollabHistoryPreviewKind; preview?: CollabHistoryPreviewFn; doc?: string } = {}) {
  const admin = options.admin ?? fakeAdmin();
  TestBed.configureTestingModule({ providers: [{ provide: HUB_ADMIN, useValue: admin }] });
  const fixture = TestBed.createComponent(CollabHistoryDrawer);
  fixture.componentRef.setInput('doc', options.doc ?? 'user-script:s1');
  fixture.componentRef.setInput('kind', options.kind ?? 'text');
  fixture.componentRef.setInput('preview', options.preview ?? collabTextPreview());
  fixture.componentRef.setInput('label', 'script');
  const closed: number[] = [];
  const restored: Array<{ snapshotId: string; takenAt: string }> = [];
  fixture.componentInstance.closed.subscribe(() => closed.push(1));
  fixture.componentInstance.restored.subscribe((r) => restored.push(r));
  const root = fixture.nativeElement as HTMLElement;
  const settle = async (): Promise<void> => {
    for (let i = 0; i < 3; i += 1) {
      fixture.detectChanges();
      await fixture.whenStable();
    }
    fixture.detectChanges();
  };
  const q = (selector: string) => root.querySelector(selector) as HTMLElement | null;
  const click = async (selector: string): Promise<void> => {
    const el = q(selector);
    expect(el, selector).not.toBeNull();
    el!.click();
    await settle();
  };
  await settle();
  return { fixture, root, admin, closed, restored, settle, q, click };
}

describe('CollabHistoryDrawer (PD-105)', () => {
  it('lists the snapshots newest first with a size, and previews the newest', async () => {
    const { root, admin, q } = await render();
    expect(admin.listCollabHistory).toHaveBeenCalledExactlyOnceWith('user-script:s1');
    expect(q('[role="dialog"][aria-modal="true"]')).not.toBeNull();
    const items = [...root.querySelectorAll('[data-collab-history-item]')];
    expect(items).toHaveLength(2);
    expect(items[0].textContent).toContain('newest');
    expect(items[0].textContent).toContain('12 B');
    expect(items[1].textContent).toContain('2.00 KiB');
    expect(items[0].getAttribute('aria-pressed')).toBe('true');
    expect(admin.getCollabSnapshot).toHaveBeenCalledExactlyOnceWith('snap_new');
    expect(q('[data-collab-history-text]')?.textContent).toBe('return 2;');
  });

  it('previews another snapshot when it is selected', async () => {
    const { root, admin, q, settle } = await render();
    (root.querySelectorAll('[data-collab-history-item]')[1] as HTMLButtonElement).click();
    await settle();
    expect(admin.getCollabSnapshot).toHaveBeenLastCalledWith('snap_old');
    expect(q('[data-collab-history-text]')?.textContent).toBe('return 1;');
  });

  it('previews a scratchpad snapshot as its notes', async () => {
    const admin = fakeAdmin({
      getCollabSnapshot: vi.fn(async () => ({ doc: 'scratchpad:default' as const, takenAt: NEW.takenAt, payload: { snippets: [{ id: 'a', title: 'Todo', body: 'milk' }, 'junk', { id: 'b', title: '', body: 'x' }] } })),
    });
    const { root } = await render({ admin, kind: 'snippets', preview: collabSnippetsPreview, doc: 'scratchpad:default' });
    const notes = [...root.querySelectorAll('[data-collab-history-note]')].map((n) => [n.querySelector('p')?.textContent?.trim(), n.querySelector('pre')?.textContent]);
    expect(notes).toEqual([['Todo', 'milk'], ['Untitled note', 'x']]);
  });

  it('restores only after the inline confirm, which explains the forward edit, and emits restored', async () => {
    const { admin, q, click, restored } = await render();
    await click('[data-collab-history-restore]');
    expect(admin.restoreCollabSnapshot).not.toHaveBeenCalled();
    const confirm = q('[data-collab-history-confirm]');
    expect(confirm?.textContent).toContain('new edit that everyone with this script open sees');
    expect(confirm?.textContent).toContain('the current version is saved to history first');
    await click('[data-collab-history-restore-confirm]');
    expect(admin.restoreCollabSnapshot).toHaveBeenCalledExactlyOnceWith('snap_new');
    expect(restored).toEqual([{ snapshotId: 'snap_new', takenAt: NEW.takenAt }]);
  });

  it('cancelling the confirm restores nothing', async () => {
    const { admin, q, click, root, settle } = await render();
    await click('[data-collab-history-restore]');
    const cancel = [...root.querySelectorAll('[data-collab-history-confirm] button')].find((b) => b.textContent?.trim() === 'Cancel') as HTMLButtonElement;
    cancel.click();
    await settle();
    expect(q('[data-collab-history-confirm]')).toBeNull();
    expect(admin.restoreCollabSnapshot).not.toHaveBeenCalled();
  });

  it('shows a failed restore and stays open', async () => {
    const admin = fakeAdmin({ restoreCollabSnapshot: vi.fn(async () => { throw new HubAdminError('hub-conflict', 'The document was closed while it was being restored.'); }) });
    const { q, click, restored } = await render({ admin });
    await click('[data-collab-history-restore]');
    await click('[data-collab-history-restore-confirm]');
    expect(q('[data-collab-history-restore-error]')?.textContent).toContain('closed while it was being restored');
    expect(restored).toEqual([]);
  });

  it('explains a consent refusal and other list or preview errors', async () => {
    const refused = await render({ admin: fakeAdmin({ listCollabHistory: vi.fn(async () => { throw new HubAdminError('forbidden', 'nope'); }) }) });
    expect(refused.q('[data-collab-history-error]')?.textContent).toContain(COLLAB_HISTORY_CONSENT_MESSAGE);
    TestBed.resetTestingModule();
    const broken = await render({ admin: fakeAdmin({ getCollabSnapshot: vi.fn(async () => { throw new HubAdminError('hub-not-found', 'No such snapshot.'); }) }) });
    expect(broken.q('[data-collab-history-preview-error]')?.textContent).toContain('No such snapshot.');
    expect((broken.q('[data-collab-history-restore]') as HTMLButtonElement).disabled).toBe(true);
  });

  it('says when there is no history yet', async () => {
    const { q } = await render({ admin: fakeAdmin({ listCollabHistory: vi.fn(async () => ({ snapshots: [] })) }) });
    expect(q('[data-collab-history-empty]')).not.toBeNull();
    expect(q('[data-collab-history-restore]')).toBeNull();
  });

  it('closes on Escape and on Close', async () => {
    const { q, closed, click } = await render();
    q('[role="dialog"]')!.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    expect(closed).toHaveLength(1);
    await click('[data-collab-history-close]');
    expect(closed).toHaveLength(2);
  });

  it('formats relative times and reads payloads defensively', () => {
    expect(relativeTimeLabel('2026-10-24T11:59:40.000Z', NOW)).toBe('just now');
    expect(relativeTimeLabel(NEW.takenAt, NOW)).toMatch(/5 minutes ago/);
    expect(relativeTimeLabel(OLD.takenAt, NOW)).toMatch(/3 hours ago/);
    expect(relativeTimeLabel('2026-10-22T12:00:00.000Z', NOW)).toMatch(/2 days ago/);
    expect(relativeTimeLabel('nope', NOW)).toBe('');
    expect(collabTextPreview()({ body: 5 })).toBe('');
    expect(collabSnippetsPreview({ snippets: 'x' })).toEqual([]);
  });
});
