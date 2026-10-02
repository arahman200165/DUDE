import { Component, DestroyRef, ElementRef, afterNextRender, inject, input, output, signal, viewChild } from '@angular/core';
import { Editor } from '@tiptap/core';
import StarterKit from '@tiptap/starter-kit';
import { Markdown } from 'tiptap-markdown';
import { sanitizeEditorHtml } from "@dude/tool-engine/tools/rich-text-editor/rich-text-export";

/**
 * Wraps TipTap's imperative, non-Angular `Editor` instance — the first
 * component in the codebase to do this (no first-party Angular bindings
 * exist for TipTap; its core is framework-agnostic vanilla TS).
 *
 * This app has no zone.js (confirmed: not a dependency), so change
 * detection here is exclusively signal-driven. `stateVersion` exists
 * specifically to bridge TipTap's imperative transaction events into a
 * signal the parent's toolbar can read for `isActive()`/`can()` checks —
 * without it, nothing would tell Angular the view needs re-checking after
 * a purely-editor-internal state change (e.g. the selection moving into a
 * bold span with no document mutation).
 */
@Component({
  selector: 'app-tiptap-editor',
  templateUrl: './tiptap-editor.html',
})
export class TiptapEditor {
  readonly initialContent = input.required<string>();
  readonly contentChange = output<string>();

  private readonly host = viewChild.required<ElementRef<HTMLElement>>('host');

  readonly editor = signal<Editor | null>(null);
  readonly stateVersion = signal(0);

  constructor() {
    afterNextRender(() => {
      const instance = new Editor({
        element: this.host().nativeElement,
        extensions: [
          // TipTap v3's StarterKit already bundles Link and Underline
          // (unlike v2, where they were separate packages) — configuring
          // them here instead of adding standalone extensions avoids the
          // "duplicate extension" warning/conflict from registering both.
          StarterKit.configure({
            link: {
              protocols: ['http', 'https', 'mailto'],
              validate: (href: string) => /^(https?|mailto):/i.test(href),
            },
          }),
          // `html: true` (the default) is required, not optional: tiptap-markdown
          // hijacks the `content`/`setContent()` STRING-parsing path to run it
          // through markdown-it first — with `html: false` that would escape our
          // own sanitized HTML as literal text instead of parsing it. This is
          // safe here because only two things ever feed a string through that
          // path: the initial persisted `contentHtml` and this component's own
          // `clear()` reset — both already sanitized, never raw user/network
          // input. Live typing/pasting goes through ProseMirror's normal
          // transaction handling instead, which this option doesn't affect.
          Markdown.configure({ html: true }),
        ],
        content: this.initialContent(),
        editorProps: {
          // Sanitizes pasted clipboard HTML before ProseMirror ever parses
          // it into the document — independent of what the curated schema
          // would otherwise allow through.
          transformPastedHTML: (html: string) => sanitizeEditorHtml(html),
        },
        onTransaction: () => this.stateVersion.update((version) => version + 1),
        onUpdate: ({ editor }) => this.contentChange.emit(sanitizeEditorHtml(editor.getHTML())),
      });
      this.editor.set(instance);
    });

    inject(DestroyRef).onDestroy(() => this.editor()?.destroy());
  }

  getMarkdown(): string {
    const editor = this.editor();
    if (!editor) return '';
    const storage = editor.storage as unknown as { markdown: { getMarkdown(): string } };
    return storage.markdown.getMarkdown();
  }
}
