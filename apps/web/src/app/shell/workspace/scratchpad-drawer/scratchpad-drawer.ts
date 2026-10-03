import { Component, effect, inject, signal, untracked } from '@angular/core';
import { RemoteChangesService } from '../../../core/sync/remote-changes.service';
import { ScratchpadService } from '../../../core/workspace/scratchpad.service';
import { WorkspaceSnippet } from "@dude/domain/core/workspace/scratchpad.model";

/** Collapsible bottom drawer listing manually-saved scratchpad snippets (Milestone 292). */
@Component({
  selector: 'app-scratchpad-drawer',
  templateUrl: './scratchpad-drawer.html',
})
export class ScratchpadDrawer {
  protected readonly scratchpad = inject(ScratchpadService);

  protected readonly editingId = signal<string | null>(null);
  protected readonly draftTitle = signal('');
  protected readonly draftBody = signal('');
  /** The scratchpad changed on another device while this draft has unsaved edits. */
  protected readonly remoteConflict = signal(false);
  private readonly remoteChanges = inject(RemoteChangesService);
  private seenRemoteAt = this.remoteChanges.changedAt('scratchpad', 'default');
  private editBase: { title: string; body: string } | null = null;

  constructor() {
    effect(() => {
      const at = this.remoteChanges.changedAt('scratchpad', 'default');
      if (at <= this.seenRemoteAt) return;
      this.seenRemoteAt = at;
      untracked(() => this.onRemoteChange());
    });
  }

  private onRemoteChange(): void {
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

  protected toggle(): void {
    this.scratchpad.toggleDrawer();
  }

  protected addBlank(): void {
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
    this.scratchpad.removeSnippet(id);
  }

  protected copy(body: string): void {
    void navigator.clipboard.writeText(body);
  }

  protected onTitleInput(event: Event): void {
    this.draftTitle.set((event.target as HTMLInputElement).value);
  }

  protected onBodyInput(event: Event): void {
    this.draftBody.set((event.target as HTMLTextAreaElement).value);
  }
}
