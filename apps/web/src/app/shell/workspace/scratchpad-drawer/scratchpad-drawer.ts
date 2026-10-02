import { Component, inject, signal } from '@angular/core';
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
