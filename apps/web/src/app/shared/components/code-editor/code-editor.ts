import { Component, DestroyRef, ElementRef, afterNextRender, computed, effect, inject, input, output, signal, untracked, viewChild } from '@angular/core';
import { AppearanceService } from '../../../core/appearance/appearance.service';
import { CODE_EDITOR_ENGINE_LOADER } from './code-editor.loader';
import type { CodeEditorBinding, CodeEditorHandle, CodeEditorLanguage, CodeEditorSelection, CodeEditorTextSize } from './code-editor.model';

export type { CodeEditorBinding, CodeEditorLanguage, CodeEditorSelection, CodeEditorTextSize } from './code-editor.model';

/**
 * A multi-line text editor for the three collaborative surfaces (Phase 31J, PD-107): the scratchpad note body,
 * a user script body and the Markdown Workspace source. It renders a plain textarea first and swaps in
 * CodeMirror 6 once the lazily imported engine chunk has loaded, so the shell can mount it without paying for
 * CodeMirror; if the chunk cannot load (offline first visit, a blocked request) the textarea simply stays and
 * editing works. Text typed into the textarea while the engine loads carries over, selection and focus included.
 *
 * Content is controlled through `value`/`valueChange` (not debounced: both fire on every edit, like an `input`
 * event). Setting `binding` switches to a shared `Y.Text` through `y-codemirror.next` and `value` is then ignored
 * for content, though `valueChange` still reports every change, local or remote.
 *
 * Tab is never captured, so keyboard users can always leave the editor. Colors come from theme tokens only; the
 * light/dark base re-derives on `AppearanceService.revision()`.
 */
@Component({
  selector: 'app-code-editor',
  templateUrl: './code-editor.html',
  host: {
    class: 'block font-mono',
    'data-code-editor': '',
    '[attr.data-code-editor-state]': 'state()',
    '[class.text-xs]': "textSize() === 'xs'",
    '[class.text-ui-xs]': "textSize() === 'ui-xs'",
    '[class.text-ui-sm]': "textSize() === 'ui-sm'",
    '[class.bg-panel]': "surface() === 'panel'",
    '[class.bg-panel-elevated]': "surface() === 'elevated'",
    '[style.--code-editor-min-height]': 'minHeight()',
    '[style.--code-editor-max-height]': 'maxHeight()',
  },
})
export class CodeEditor {
  private readonly loader = inject(CODE_EDITOR_ENGINE_LOADER);
  private readonly appearance = inject(AppearanceService);
  private readonly mount = viewChild.required<ElementRef<HTMLElement>>('mount');
  private readonly fallback = viewChild<ElementRef<HTMLTextAreaElement>>('fallback');

  readonly value = input('');
  readonly valueChange = output<string>();
  readonly language = input<CodeEditorLanguage>('plain');
  readonly placeholder = input('');
  readonly readonly = input(false);
  readonly ariaLabel = input<string | null>(null);
  readonly ariaLabelledby = input<string | null>(null);
  /** CSS lengths (`4.5rem`); the editor grows between them and scrolls past the maximum. Unset: fill the host. */
  readonly minHeight = input<string | null>(null);
  readonly maxHeight = input<string | null>(null);
  readonly textSize = input<CodeEditorTextSize>('xs');
  readonly surface = input<'panel' | 'elevated'>('panel');
  readonly binding = input<CodeEditorBinding | null>(null);
  /** The element that scrolls (the CodeMirror scroller, or the fallback textarea), for scroll syncing. */
  readonly scrolled = output<HTMLElement>();

  protected readonly state = signal<'loading' | 'editor' | 'fallback'>('loading');
  readonly engineState = this.state.asReadonly();
  /** True while a live CodeMirror view edits the bound `Y.Text`; callers must not also write `Y.Text` for local edits. */
  readonly bound = computed(() => this.state() === 'editor' && this.binding() !== null);

  private handle: CodeEditorHandle | null = null;
  private destroyed = false;

  constructor() {
    afterNextRender(() => void this.load());

    effect(() => {
      const value = this.value();
      const binding = this.binding();
      untracked(() => {
        if (!this.handle) return;
        this.handle.setBinding(binding, value);
        if (!binding) this.handle.setText(value);
      });
    });
    effect(() => {
      const language = this.language();
      untracked(() => void this.handle?.setLanguage(language));
    });
    effect(() => {
      const readonly = this.readonly();
      untracked(() => this.handle?.setReadonly(readonly));
    });
    effect(() => {
      const placeholder = this.placeholder();
      untracked(() => this.handle?.setPlaceholder(placeholder));
    });
    effect(() => {
      const label = this.ariaLabel();
      const labelledby = this.ariaLabelledby();
      untracked(() => this.handle?.setAria(label, labelledby));
    });
    effect(() => {
      this.appearance.revision();
      untracked(() => this.handle?.refreshTheme());
    });

    inject(DestroyRef).onDestroy(() => {
      this.destroyed = true;
      this.handle?.destroy();
      this.handle = null;
    });
  }

  getText(): string {
    return this.handle ? this.handle.getText() : (this.fallback()?.nativeElement.value ?? this.value());
  }

  getSelection(): CodeEditorSelection {
    if (this.handle) return this.handle.getSelection();
    const textarea = this.fallback()?.nativeElement;
    return { start: textarea?.selectionStart ?? 0, end: textarea?.selectionEnd ?? 0 };
  }

  setSelection(start: number, end: number): void {
    if (this.handle) {
      this.handle.setSelection(start, end, true);
      return;
    }
    this.fallback()?.nativeElement.setSelectionRange(start, end);
  }

  focus(): void {
    if (this.handle) this.handle.focus();
    else this.fallback()?.nativeElement.focus();
  }

  /** Replaces `[from, to)` and selects `selection` (default: after the inserted text), keeping the editor's undo history. */
  replaceRange(from: number, to: number, insert: string, selection?: CodeEditorSelection): void {
    if (this.handle) {
      this.handle.replaceRange(from, to, insert, selection);
      return;
    }
    const textarea = this.fallback()?.nativeElement;
    if (!textarea) return;
    const next = textarea.value.slice(0, from) + insert + textarea.value.slice(to);
    textarea.value = next;
    const cursor = from + insert.length;
    textarea.setSelectionRange(selection?.start ?? cursor, selection?.end ?? cursor);
    this.valueChange.emit(next);
  }

  /** The scrolling element, or null before anything is rendered. */
  scroller(): HTMLElement | null {
    return this.handle ? this.handle.scroller() : (this.fallback()?.nativeElement ?? null);
  }

  protected onFallbackInput(event: Event): void {
    this.valueChange.emit((event.target as HTMLTextAreaElement).value);
  }

  protected onFallbackScroll(event: Event): void {
    this.scrolled.emit(event.target as HTMLElement);
  }

  private async load(): Promise<void> {
    let handle: CodeEditorHandle;
    try {
      const engine = await this.loader();
      if (this.destroyed) return;
      handle = await engine.mountCodeEditor({
        parent: this.mount().nativeElement,
        doc: this.getText(),
        language: this.language(),
        placeholder: this.placeholder(),
        readonly: this.readonly(),
        ariaLabel: this.ariaLabel(),
        ariaLabelledby: this.ariaLabelledby(),
        binding: this.binding(),
        onChange: (text) => this.valueChange.emit(text),
        onScroll: (scroller) => this.scrolled.emit(scroller),
      });
    } catch {
      if (!this.destroyed) this.state.set('fallback');
      return;
    }
    if (this.destroyed) {
      handle.destroy();
      return;
    }

    const textarea = this.fallback()?.nativeElement;
    const hadFocus = !!textarea && textarea.ownerDocument.activeElement === textarea;
    const selection = textarea ? { start: textarea.selectionStart, end: textarea.selectionEnd } : null;

    this.handle = handle;
    const binding = this.binding();
    const value = this.value();
    handle.setBinding(binding, value);
    if (!binding) {
      handle.setText(value);
      if (selection) handle.setSelection(selection.start, selection.end);
    }
    this.state.set('editor');
    if (hadFocus) handle.focus();
  }
}
