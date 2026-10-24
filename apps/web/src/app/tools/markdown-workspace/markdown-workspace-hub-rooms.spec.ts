import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { MARKDOWN_TEXT } from '@dude/collab-doc';
import type { CollabAwarenessIdentity } from '@dude/collab-doc';
import type { CollabTransport } from '@dude/collab-doc';
import { HUB_COLLAB, UNAVAILABLE_COLLAB_TRANSPORT } from '../../core/collab/hub-collab.token';
import { FakeCollabHub, FakeCollabTransport } from '../../core/collab/testing/fake-collab-hub';
import { createDesktopHubAdmin } from '../../core/hub/desktop-hub-admin.adapter';
import { HubAdminError, type HubAdminPort } from '../../core/hub/hub-admin.port';
import { HUB_ADMIN } from '../../core/hub/hub-admin.token';
import { fakeHub } from '../../core/platform/testing/fake-hub';
import { SyncStatusService } from '../../core/sync/sync-status.service';
import { CodeEditor } from '../../shared/components/code-editor/code-editor';
import { stubEditorLayout } from '../../shared/components/code-editor/testing/stub-layout';
import { HUB_ROOM_CONSENT_MESSAGE } from './markdown-hub-rooms';
import { MarkdownWorkspace } from './markdown-workspace';

const ME: CollabAwarenessIdentity = { deviceId: 'dev-me', name: 'Me', colorSlot: 2 };

describe('MarkdownWorkspace Hub rooms (PD-104)', () => {
  beforeAll(stubEditorLayout);
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
  });

  function create(options: { transport?: CollabTransport; admin?: Partial<HubAdminPort>; enrolled?: boolean } = {}) {
    const collabHub = new FakeCollabHub();
    const transport = options.transport ?? new FakeCollabTransport(collabHub, ME);
    const bridge = fakeHub();
    const admin = { ...createDesktopHubAdmin(() => bridge), ...options.admin } as HubAdminPort;
    const spies = {
      keep: vi.spyOn(admin, 'keepCollabRoom'),
      remove: vi.spyOn(admin, 'deleteCollabDocument'),
    };
    TestBed.configureTestingModule({
      providers: [
        { provide: HUB_COLLAB, useValue: transport },
        { provide: HUB_ADMIN, useValue: admin },
        { provide: SyncStatusService, useValue: { status: signal({ pending: 0 }), enrolled: signal(options.enrolled ?? true) } },
      ],
    });
    const fixture = TestBed.createComponent(MarkdownWorkspace);
    fixture.detectChanges();
    const workspace = fixture.componentInstance as unknown as Record<string, any>;
    const root = fixture.nativeElement as HTMLElement;
    const editor = () => fixture.debugElement.query(By.directive(CodeEditor)).componentInstance as CodeEditor;
    const fake = transport instanceof FakeCollabTransport ? transport : null;
    /** Runs effects, completes the collab link's hello once and drains the fake Hub. */
    const settle = async (): Promise<void> => {
      for (let i = 0; i < 4; i += 1) {
        await fixture.whenStable();
        TestBed.tick();
        if (fake && fake.started.length > 0 && !fake.connection.welcomed) fake.welcome();
        collabHub.pump();
      }
      fixture.detectChanges();
    };
    const click = async (selector: string): Promise<void> => {
      const el = root.querySelector(selector) as HTMLButtonElement | null;
      expect(el, selector).not.toBeNull();
      el!.click();
      await settle();
    };
    const type = (selector: string, value: string): void => {
      const input = root.querySelector(selector) as HTMLInputElement;
      input.value = value;
      input.dispatchEvent(new Event('input'));
      fixture.detectChanges();
    };
    return { fixture, workspace, root, editor, collabHub, transport: fake, bridge, admin, spies, settle, click, type };
  }

  it('shows no Hub room UI where Hub collaboration is unavailable (Pages, standalone)', async () => {
    const { root, workspace } = create({ transport: UNAVAILABLE_COLLAB_TRANSPORT });
    expect(workspace['hub'].available()).toBe(false);
    expect(root.querySelector('[data-hub-room-toggle]')).toBeNull();
    expect(root.querySelector('[data-hub-room-panel]')).toBeNull();
  });

  it('shows no Hub room UI on a desktop that is not enrolled', () => {
    const { root } = create({ enrolled: false });
    expect(root.querySelector('[data-hub-room-toggle]')).toBeNull();
  });

  it('starts a room seeded with the editor text and binds the editor to room:<id>', async () => {
    const t = create();
    t.workspace['source'].set('# Agenda');
    t.fixture.detectChanges();
    await t.click('[data-hub-room-toggle]');
    expect(t.root.querySelector('[data-hub-room-panel]')).not.toBeNull();
    t.type('[data-hub-room-name]', 'Standup');
    await t.click('[data-hub-room-start]');

    const target = t.workspace['hub'].target();
    expect(target).toMatchObject({ kind: 'room', name: 'Standup' });
    expect(t.transport!.connection.controls).toContainEqual(expect.objectContaining({ type: 'subscribe', doc: `room:${target.id}` }));
    expect(t.workspace['hub'].session.mode()).toBe('live');
    expect(t.editor().binding()).toBe(t.workspace['hub'].session.binding());
    expect(t.collabHub.text(`room:${target.id}`, MARKDOWN_TEXT)).toBe('# Agenda');
    expect(t.root.querySelector('[data-hub-room-status]')?.textContent).toContain('Standup');
  });

  it('joins an open room, adopts its text, follows remote edits and leaves back to a plain draft', async () => {
    const t = create();
    const room = (await t.bridge.createCollabRoom('Shared')) as { ok: true; result: { id: string } };
    const key = `room:${room.result.id}`;
    t.collabHub.room(key).doc.getText(MARKDOWN_TEXT).insert(0, 'from the room');
    await t.click('[data-hub-room-toggle]');
    expect(t.root.querySelectorAll('[data-hub-room]')).toHaveLength(1);
    await t.click('[data-hub-room] button');

    expect(t.workspace['source']()).toBe('from the room');
    expect(t.editor().binding()).not.toBeNull();
    t.collabHub.room(key).doc.getText(MARKDOWN_TEXT).insert(0, '> ');
    await t.settle();
    expect(t.workspace['source']()).toBe('> from the room');

    // A whole-text write (Clear) reaches the room like typing.
    t.workspace['clear']();
    await t.settle();
    expect(t.collabHub.text(key, MARKDOWN_TEXT)).toBe('');

    await t.click('[data-hub-leave]');
    expect(t.workspace['hub'].target()).toBeNull();
    expect(t.editor().binding()).toBeNull();
  });

  it('keeps a room only after the disclosure, then switches the editor to markdown-doc:<entityId>', async () => {
    const t = create();
    await t.click('[data-hub-room-toggle]');
    t.type('[data-hub-room-name]', 'Notes');
    await t.click('[data-hub-room-start]');
    const roomId = t.workspace['hub'].target().id as string;

    await t.click('[data-hub-keep]');
    const disclosure = t.root.querySelector('[data-hub-keep-disclosure]')!;
    expect(disclosure.textContent).toContain('your Hub');
    expect(disclosure.textContent).toContain('your signed-in devices and browsers');
    expect(disclosure.textContent).toContain('kept until you delete it');
    expect(disclosure.textContent).toContain('Markdown documents');
    expect(t.spies.keep).not.toHaveBeenCalled();
    t.type('[data-hub-keep-title]', 'Weekly notes');
    await t.click('[data-hub-keep-confirm]');

    expect(t.spies.keep).toHaveBeenCalledExactlyOnceWith(roomId, 'Weekly notes');
    const target = t.workspace['hub'].target();
    expect(target).toMatchObject({ kind: 'doc', name: 'Weekly notes' });
    expect(t.transport!.connection.controls).toContainEqual(expect.objectContaining({ type: 'subscribe', doc: `markdown-doc:${target.id}` }));
    expect(t.workspace['hub'].session.mode()).toBe('live');
    expect(t.root.querySelectorAll('[data-hub-document]')).toHaveLength(1);
  });

  it('opens a kept document and deletes it only after a second confirming click', async () => {
    const t = create();
    const room = (await t.bridge.createCollabRoom('R')) as { ok: true; result: { id: string } };
    const kept = (await t.bridge.keepCollabRoom(room.result.id, 'Plan')) as { ok: true; result: { entityId: string } };
    const key = `markdown-doc:${kept.result.entityId}`;
    t.collabHub.room(key).doc.getText(MARKDOWN_TEXT).insert(0, '# Plan');
    await t.click('[data-hub-room-toggle]');
    await t.click('[data-hub-document-open]');
    expect(t.workspace['hub'].target()).toMatchObject({ kind: 'doc', id: kept.result.entityId });
    expect(t.workspace['source']()).toBe('# Plan');
    expect(t.editor().binding()).not.toBeNull();

    await t.click('[data-hub-delete]');
    expect(t.spies.remove).not.toHaveBeenCalled();
    await t.click('[data-hub-delete-confirm]');
    expect(t.spies.remove).toHaveBeenCalledExactlyOnceWith(kept.result.entityId);
    expect(t.workspace['hub'].target()).toBeNull();
    expect(t.root.querySelectorAll('[data-hub-document]')).toHaveLength(0);
  });

  it('explains how to turn on the Markdown documents category when the Hub refuses', async () => {
    const refusal = new HubAdminError('forbidden', 'Kept documents need the Markdown documents sync category enabled.');
    const t = create({ admin: { listCollabDocuments: async () => { throw refusal; }, keepCollabRoom: async () => { throw refusal; } } });
    await t.click('[data-hub-room-toggle]');
    expect(t.root.querySelector('[data-hub-documents-consent]')?.textContent).toContain('Settings › Sync');

    t.type('[data-hub-room-name]', 'Notes');
    await t.click('[data-hub-room-start]');
    await t.click('[data-hub-keep]');
    t.type('[data-hub-keep-title]', 'Notes');
    await t.click('[data-hub-keep-confirm]');
    expect(t.workspace['hub'].error()).toBe(HUB_ROOM_CONSENT_MESSAGE);
    expect(t.workspace['hub'].target()).toMatchObject({ kind: 'room' });

    // A kept document the Hub refuses to serve (consent off) explains the same.
    t.collabHub.refusals.set('markdown-doc:gone', 'consent-required');
    t.workspace['hub'].openDocument({ id: 'gone', title: 'Gone', updatedAt: 'x', bytes: 0 });
    await t.settle();
    expect(t.workspace['hub'].refusalMessage()).toBe(HUB_ROOM_CONSENT_MESSAGE);
    expect(t.editor().binding()).toBeNull();
  });
});
