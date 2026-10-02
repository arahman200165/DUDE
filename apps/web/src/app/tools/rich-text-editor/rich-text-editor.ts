import { Component, ViewChild, inject, signal } from '@angular/core';
import { ToolShell } from '../../shared/components/tool-shell/tool-shell';
import { PersistenceService } from '../../core/persistence/persistence.service';
import { downloadFile } from '../../shared/utils/download-file';
import { TiptapEditor } from './tiptap-editor/tiptap-editor';

const DEFAULT_CONTENT = '<p>Start typing…</p>';

/** No worker: TipTap's `Editor` is a live DOM/component surface, not a batch pure-function transform. */
@Component({
  selector: 'app-rich-text-editor',
  imports: [ToolShell, TiptapEditor],
  templateUrl: './rich-text-editor.html',
})
export class RichTextEditor {
  private readonly persistence = inject(PersistenceService);

  protected readonly contentHtml = this.persistence.signal('rich-text-editor', 'contentHtml', 'session', DEFAULT_CONTENT);

  protected readonly linkPromptOpen = signal(false);
  protected readonly linkUrlDraft = signal('');

  @ViewChild(TiptapEditor) private tiptap?: TiptapEditor;

  protected onContentChange(html: string): void {
    this.contentHtml.set(html);
  }

  protected isActive(name: string): boolean {
    this.tiptap?.stateVersion();
    return this.tiptap?.editor()?.isActive(name) ?? false;
  }

  protected toggleBold(): void {
    this.tiptap?.editor()?.chain().focus().toggleBold().run();
  }

  protected toggleItalic(): void {
    this.tiptap?.editor()?.chain().focus().toggleItalic().run();
  }

  protected toggleUnderline(): void {
    this.tiptap?.editor()?.chain().focus().toggleUnderline().run();
  }

  protected toggleStrike(): void {
    this.tiptap?.editor()?.chain().focus().toggleStrike().run();
  }

  protected toggleHeading(level: 1 | 2 | 3): void {
    this.tiptap?.editor()?.chain().focus().toggleHeading({ level }).run();
  }

  protected toggleBulletList(): void {
    this.tiptap?.editor()?.chain().focus().toggleBulletList().run();
  }

  protected toggleOrderedList(): void {
    this.tiptap?.editor()?.chain().focus().toggleOrderedList().run();
  }

  protected toggleBlockquote(): void {
    this.tiptap?.editor()?.chain().focus().toggleBlockquote().run();
  }

  protected toggleCodeBlock(): void {
    this.tiptap?.editor()?.chain().focus().toggleCodeBlock().run();
  }

  protected setHorizontalRule(): void {
    this.tiptap?.editor()?.chain().focus().setHorizontalRule().run();
  }

  protected undo(): void {
    this.tiptap?.editor()?.chain().focus().undo().run();
  }

  protected redo(): void {
    this.tiptap?.editor()?.chain().focus().redo().run();
  }

  protected openLinkPrompt(): void {
    const href = this.tiptap?.editor()?.getAttributes('link')?.['href'];
    this.linkUrlDraft.set(typeof href === 'string' ? href : '');
    this.linkPromptOpen.set(true);
  }

  protected onLinkUrlInput(event: Event): void {
    this.linkUrlDraft.set((event.target as HTMLInputElement).value);
  }

  protected confirmLink(): void {
    const chain = this.tiptap?.editor()?.chain().focus();
    if (!chain) return;

    const url = this.linkUrlDraft().trim();
    if (url === '') chain.unsetLink().run();
    else chain.setLink({ href: url }).run();

    this.linkPromptOpen.set(false);
  }

  protected cancelLinkPrompt(): void {
    this.linkPromptOpen.set(false);
  }

  protected copyHtml(): void {
    void navigator.clipboard.writeText(this.contentHtml());
  }

  protected copyMarkdown(): void {
    void navigator.clipboard.writeText(this.tiptap?.getMarkdown() ?? '');
  }

  protected downloadHtml(): void {
    downloadFile(new TextEncoder().encode(this.contentHtml()), 'document.html', 'text/html');
  }

  protected downloadMarkdown(): void {
    downloadFile(new TextEncoder().encode(this.tiptap?.getMarkdown() ?? ''), 'document.md', 'text/markdown');
  }

  protected clear(): void {
    this.tiptap?.editor()?.chain().focus().setContent(DEFAULT_CONTENT).run();
  }
}
