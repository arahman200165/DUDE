import { Component, DestroyRef, ElementRef, computed, effect, inject, signal, untracked, viewChild } from '@angular/core';
import { CodeEditor } from '../../../shared/components/code-editor/code-editor';
import { CollabHistoryDrawer, collabSnippetsPreview } from '../../../shared/components/collab-history-drawer/collab-history-drawer';
import { RemoteChangesService } from '../../../core/sync/remote-changes.service';
import { SCRATCHPAD_DOC_KEY, ScratchpadCollab, remapCaret } from '../../../core/workspace/scratchpad-collab';
import { ScratchpadService } from '../../../core/workspace/scratchpad.service';
import { WorkspaceSnippet } from "@dude/domain/core/workspace/scratchpad.model";

/**
 * Collapsible bottom drawer listing manually-saved scratchpad snippets (Milestone 292). Since Phase 31J (Milestone 806) the notes are
 * edited live when a Hub is reachable (`ScratchpadCollab`): no Save, other participants' cursors shown next to each note. Everywhere
 * else, and whenever the Hub link is lost on a desktop, it edits the key/value scratchpad with an explicit Save, as before.
 */
@Component({
  selector: 'app-scratchpad-drawer',
  imports: [CodeEditor, CollabHistoryDrawer],
  templateUrl: './scratchpad-drawer.html',
})
export class ScratchpadDrawer {
  protected readonly scratchpad = inject(ScratchpadService);
  protected readonly collab = inject(ScratchpadCollab);

  protected readonly editingId = signal<string | null>(null);
  protected readonly draftTitle = signal('');
  protected readonly draftBody = signal('');
  /** The scratchpad changed on another device while this draft has unsaved edits. */
  protected readonly remoteConflict = signal(false);
  /** Version history (PD-105), offered only while the notes are live. */
  protected readonly historyOpen = signal(false);
  protected readonly historyStatus = signal('');
  protected readonly historyDoc = SCRATCHPAD_DOC_KEY;
  protected readonly historyPreview = collabSnippetsPreview;
  private readonly remoteChanges = inject(RemoteChangesService);
  private seenRemoteAt = this.remoteChanges.changedAt('scratchpad', 'default');
  private editBase: { title: string; body: string } | null = null;

  private readonly liveTitleInput = viewChild<ElementRef<HTMLInputElement>>('liveTitle');
  private readonly liveEditor = viewChild<CodeEditor>('liveEditor');

  /** The note being edited, as the shared document (live) or the saved list holds it. */
  protected readonly editing = computed(() => {
    const id = this.editingId();
    return id === null ? undefined : this.collab.snippets().find((snippet) => snippet.id === id);
  });
  protected readonly bodyBinding = computed(() => {
    const id = this.editingId();
    return id === null ? null : this.collab.bodyBinding(id);
  });

  constructor() {
    effect(() => {
      const at = this.remoteChanges.changedAt('scratchpad', 'default');
      if (at <= this.seenRemoteAt) return;
      this.seenRemoteAt = at;
      untracked(() => this.onRemoteChange());
    });

    const expanded = this.scratchpad.drawerExpanded;
    effect(() => {
      const open = expanded();
      untracked(() => this.collab.setActive(open));
    });
    effect(() => {
      const open = this.editingId() !== null;
      untracked(() => this.collab.setLocalDraftOpen(open));
    });
    inject(DestroyRef).onDestroy(() => this.collab.setActive(false));

    // A note open for editing follows the mode: a lost Hub link reseeds the local draft from what was kept on this device, read-only closes it.
    let previousMode = this.collab.mode();
    effect(() => {
      const mode = this.collab.mode();
      const before = previousMode;
      previousMode = mode;
      if (mode === before) return;
      untracked(() => {
        if (this.editingId() === null) return;
        if (mode === 'read-only') this.editingId.set(null);
        else if (mode === 'local') this.reloadDraft();
      });
    });
    // History belongs to the live document: leaving live mode (or closing the drawer) closes it.
    effect(() => {
      const live = this.collab.mode() === 'live' && this.scratchpad.drawerExpanded();
      untracked(() => {
        if (!live) this.historyOpen.set(false);
      });
    });
    // A note deleted elsewhere closes its live editor.
    effect(() => {
      const snippets = this.collab.snippets();
      untracked(() => {
        const id = this.editingId();
        if (id !== null && this.collab.mode() === 'live' && !snippets.some((snippet) => snippet.id === id)) this.editingId.set(null);
      });
    });
    // The live title input is not bound by value: a remote edit never moves the caret of an input being typed in.
    effect(() => {
      const input = this.liveTitleInput()?.nativeElement;
      const title = this.editing()?.title ?? '';
      if (input) untracked(() => this.showTitle(input, title));
    });
  }

  private showTitle(input: HTMLInputElement, title: string): void {
    const current = input.value;
    if (current === title) return;
    if (input.ownerDocument.activeElement !== input) {
      input.value = title;
      return;
    }
    const start = input.selectionStart ?? current.length;
    const end = input.selectionEnd ?? start;
    input.value = title;
    input.setSelectionRange(remapCaret(current, title, start), remapCaret(current, title, end));
  }

  private onRemoteChange(): void {
    if (this.collab.mode() !== 'local') return;
    const id = this.editingId();
    if (!id) return;
    const dirty = this.editBase !== null && (this.draftTitle() !== this.editBase.title || this.draftBody() !== this.editBase.body);
    if (dirty) this.remoteConflict.set(true);
    else this.reloadDraft();
  }

  /** Replaces the draft with the synced note (or closes the editor if it was deleted elsewhere). */
  protected reloadDraft(): void {
    const id = this.editingId();
    const latest = id ? this.scratchpad.snippets().find((snippet) => snippet.id === id) : undefined;
    this.remoteConflict.set(false);
    if (latest) this.startEdit(latest);
    else this.editingId.set(null);
  }

  protected keepEditing(): void {
    this.remoteConflict.set(false);
  }

  protected openHistory(): void {
    this.historyStatus.set('');
    this.historyOpen.set(true);
  }

  /** The Hub applied the restore as a new edit; it reaches the notes through the live document by itself. */
  protected onHistoryRestored(): void {
    this.historyOpen.set(false);
    this.historyStatus.set('Restored an earlier version. Everyone with the scratchpad open sees it now.');
  }

  protected toggle(): void {
    this.scratchpad.toggleDrawer();
  }

  protected addBlank(): void {
    if (this.collab.mode() === 'live') {
      const id = this.collab.add('Untitled note', '');
      if (id !== null) this.editingId.set(id);
      return;
    }
    const snippet = this.scratchpad.addSnippet('Untitled note', '');
    this.startEdit(snippet);
  }

  protected startEdit(snippet: WorkspaceSnippet): void {
    this.editingId.set(snippet.id);
    this.draftTitle.set(snippet.title);
    this.draftBody.set(snippet.body);
    this.editBase = { title: snippet.title, body: snippet.body };
    this.remoteConflict.set(false);
  }

  protected saveEdit(): void {
    const id = this.editingId();
    if (!id) return;
    this.scratchpad.updateSnippet(id, { title: this.draftTitle(), body: this.draftBody() });
    this.editingId.set(null);
  }

  protected cancelEdit(): void {
    this.editingId.set(null);
  }

  protected remove(id: string): void {
    if (this.editingId() === id) this.editingId.set(null);
    if (this.collab.mode() === 'live') this.collab.remove(id);
    else this.scratchpad.removeSnippet(id);
  }

  protected move(id: string, delta: number): void {
    this.collab.move(id, delta);
  }

  protected copy(body: string): void {
    void navigator.clipboard.writeText(body);
  }

  protected onTitleInput(event: Event): void {
    this.draftTitle.set((event.target as HTMLInputElement).value);
  }

  protected onLiveTitleInput(event: Event): void {
    const id = this.editingId();
    if (id) this.collab.setTitle(id, (event.target as HTMLInputElement).value);
  }

  /** A bound editor already wrote the shared text; the plain textarea fallback reports the edit and it is diffed in. */
  protected onLiveBodyChange(value: string): void {
    const id = this.editingId();
    if (id && !this.liveEditor()?.bound()) this.collab.setBody(id, value);
  }
}
