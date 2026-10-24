import type * as Y from 'yjs';
import type { Awareness } from 'y-protocols/awareness';

/** Syntax the editor highlights; `plain` is unhighlighted text. */
export type CodeEditorLanguage = 'markdown' | 'javascript' | 'plain';

/** Font size of the editor text, as the shared type steps (the host sets font family and size, the theme inherits). */
export type CodeEditorTextSize = 'xs' | 'ui-xs' | 'ui-sm';

/**
 * Binds the editor to a shared `Y.Text` through `y-codemirror.next` instead of the `value` input. The Y.Doc, its
 * provider and the awareness stay with the caller; the editor only reads the text and renders remote cursors.
 */
export interface CodeEditorBinding {
  readonly ytext: Y.Text;
  readonly awareness?: Awareness;
  /** Defaults to a new `Y.UndoManager(ytext)`; the editor tracks only its own edits. */
  readonly undoManager?: Y.UndoManager;
  /** Local presence shown to collaborators. `colorSlot` (0-7) picks one of the palette tokens. */
  readonly user?: { readonly name: string; readonly colorSlot?: number };
}

export interface CodeEditorSelection {
  readonly start: number;
  readonly end: number;
}

/** What a mounted CodeMirror view offers the component. Implemented by `code-editor.engine.ts` (the lazy chunk). */
export interface CodeEditorHandle {
  getText(): string;
  /** Replaces the whole document without notifying `onChange`; a no-op when the text is already equal. */
  setText(text: string): void;
  getSelection(): CodeEditorSelection;
  setSelection(start: number, end: number, reveal?: boolean): void;
  replaceRange(from: number, to: number, insert: string, selection?: CodeEditorSelection): void;
  focus(): void;
  hasFocus(): boolean;
  scroller(): HTMLElement;
  setLanguage(language: CodeEditorLanguage): Promise<void>;
  setReadonly(readonly: boolean): void;
  setPlaceholder(text: string): void;
  setAria(label: string | null, labelledby: string | null): void;
  /** Switches between the plain document and a Yjs-bound one; `fallbackDoc` seeds the plain document. */
  setBinding(binding: CodeEditorBinding | null, fallbackDoc: string): void;
  /** Re-derives the theme (light or dark base) after an appearance change. */
  refreshTheme(): void;
  destroy(): void;
}

export interface CodeEditorMountOptions {
  readonly parent: HTMLElement;
  readonly doc: string;
  readonly language: CodeEditorLanguage;
  readonly placeholder: string;
  readonly readonly: boolean;
  readonly ariaLabel: string | null;
  readonly ariaLabelledby: string | null;
  readonly binding: CodeEditorBinding | null;
  readonly onChange: (text: string) => void;
  readonly onScroll: (scroller: HTMLElement) => void;
}

/** The shape of the lazily imported editor chunk. */
export interface CodeEditorEngine {
  mountCodeEditor(options: CodeEditorMountOptions): Promise<CodeEditorHandle>;
}
