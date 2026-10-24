import { Annotation, Compartment, EditorSelection, EditorState, type Extension } from '@codemirror/state';
import { EditorView, drawSelection, keymap, placeholder as placeholderExtension } from '@codemirror/view';
import { defaultKeymap, history, historyKeymap } from '@codemirror/commands';
import { HighlightStyle, syntaxHighlighting } from '@codemirror/language';
import { search, searchKeymap } from '@codemirror/search';
import { tags } from '@lezer/highlight';
import * as Y from 'yjs';
import { yCollab, yUndoManagerKeymap } from 'y-codemirror.next';
import type { Awareness } from 'y-protocols/awareness';
import type {
  CodeEditorBinding,
  CodeEditorHandle,
  CodeEditorLanguage,
  CodeEditorMountOptions,
  CodeEditorSelection,
} from './code-editor.model';
import { collabCursorColors, normalizeColorSlot } from "@dude/tool-engine/shared/components/code-editor/collab-colors";

/**
 * The CodeMirror 6 engine behind `<app-code-editor>` (Phase 31J, PD-107). This module is the only place
 * CodeMirror and `y-codemirror.next` are imported, and the component loads it with a dynamic `import()`,
 * so none of it lands in the initial, shell or tool chunks of the pages that never open an editor.
 *
 * Keyboard: Tab and Shift+Tab are deliberately not bound (no `indentWithTab`), so keyboard users can always
 * move focus out of the editor. Every other default editing key keeps working.
 */

/** Marks a transaction the component issued itself, so it is not reported back as a user edit. */
const programmatic = Annotation.define<boolean>();

const MAX_NAME_LENGTH = 40;

/** The palette tokens are CSS variables, so a theme change needs no re-read except the light/dark base. */
function isDarkTheme(): boolean {
  return document.documentElement.getAttribute('data-theme') !== 'light';
}

function accent(percent: number): string {
  return `color-mix(in srgb, var(--dude-accent) ${percent}%, transparent)`;
}

function createTheme(dark: boolean): Extension {
  return EditorView.theme(
    {
      '&': {
        color: 'var(--dude-text)',
        backgroundColor: 'transparent',
        height: '100%',
        minHeight: 'var(--code-editor-min-height, 0px)',
        maxHeight: 'var(--code-editor-max-height, none)',
        fontSize: 'inherit',
      },
      '&.cm-focused': {
        outline: 'var(--dude-focus-width) solid var(--dude-accent)',
        outlineOffset: 'calc(var(--dude-focus-width) * -1)',
      },
      '.cm-scroller': {
        fontFamily: 'var(--dude-font-mono)',
        lineHeight: '1.5',
        overflow: 'auto',
      },
      '.cm-content': {
        caretColor: 'var(--dude-text)',
        padding: 'calc(var(--dude-spacing) * 1.5) calc(var(--dude-spacing) * 2)',
      },
      '.cm-line': { padding: '0' },
      '.cm-cursor, .cm-dropCursor': { borderLeftColor: 'var(--dude-text)' },
      '.cm-selectionBackground, &.cm-focused > .cm-scroller > .cm-selectionLayer .cm-selectionBackground': {
        background: accent(35),
      },
      '.cm-placeholder': { color: 'var(--dude-text-muted)' },
      '.cm-panels': {
        backgroundColor: 'var(--dude-panel-elevated)',
        color: 'var(--dude-text)',
        borderColor: 'var(--dude-border)',
      },
      '.cm-panels.cm-panels-top': { borderBottom: '1px solid var(--dude-border)' },
      '.cm-panels.cm-panels-bottom': { borderTop: '1px solid var(--dude-border)' },
      '.cm-panel.cm-search': { fontFamily: 'var(--dude-font-sans)' },
      '.cm-panel.cm-search label': { color: 'var(--dude-text)' },
      '.cm-panel.cm-search [name=close]': { color: 'var(--dude-text-muted)' },
      '.cm-textfield': {
        backgroundColor: 'var(--dude-panel)',
        color: 'var(--dude-text)',
        border: '1px solid var(--dude-border)',
      },
      '.cm-button': {
        backgroundImage: 'none',
        backgroundColor: 'var(--dude-panel)',
        color: 'var(--dude-text)',
        border: '1px solid var(--dude-border)',
      },
      '.cm-searchMatch': { backgroundColor: 'color-mix(in srgb, var(--dude-warning) 30%, transparent)' },
      '.cm-searchMatch.cm-searchMatch-selected': {
        backgroundColor: 'color-mix(in srgb, var(--dude-warning) 55%, transparent)',
      },
      // Remote collaborators: caret and selection colors come from the palette tokens (see @dude/tool-engine's collab-colors).
      // The name label is a neutral chip (theme text on the elevated panel); the collaborator's color stays on the caret
      // and selection, so no text ever sits on a palette fill without an on-* token.
      '.cm-ySelectionInfo': {
        fontFamily: 'var(--dude-font-sans)',
        color: 'var(--dude-text)',
        backgroundColor: 'var(--dude-panel-elevated) !important',
        border: '1px solid var(--dude-border)',
        opacity: '1',
        fontSize: '0.75em',
        paddingInline: 'calc(var(--dude-spacing) * 0.5)',
      },
      '@media (prefers-reduced-motion: reduce)': {
        '.cm-ySelectionCaretDot, .cm-ySelectionInfo': { transition: 'none' },
      },
    },
    { dark },
  );
}

const themes = new Map<boolean, Extension>();

/** One theme extension per base, so repeated appearance changes do not keep adding style rules. */
function buildTheme(dark: boolean): Extension {
  let theme = themes.get(dark);
  if (!theme) themes.set(dark, (theme = createTheme(dark)));
  return theme;
}

/** Syntax colors come from tokens only, so they follow every theme, palette set and contrast mode. */
const highlightStyle = HighlightStyle.define([
  { tag: [tags.heading1, tags.heading2, tags.heading3, tags.heading4, tags.heading5, tags.heading6, tags.heading], fontWeight: 'bold', color: 'var(--dude-accent)' },
  { tag: tags.strong, fontWeight: 'bold' },
  { tag: tags.emphasis, fontStyle: 'italic' },
  { tag: tags.strikethrough, textDecoration: 'line-through' },
  { tag: [tags.link, tags.url], color: 'var(--dude-info)' },
  { tag: tags.link, textDecoration: 'underline' },
  { tag: [tags.quote, tags.comment, tags.meta, tags.processingInstruction, tags.contentSeparator], color: 'var(--dude-text-muted)' },
  { tag: tags.comment, fontStyle: 'italic' },
  { tag: tags.monospace, color: 'var(--dude-cat-encoding-tint)' },
  { tag: [tags.keyword, tags.modifier, tags.controlKeyword, tags.operatorKeyword], color: 'var(--dude-cat-data-tint)' },
  { tag: [tags.string, tags.special(tags.string)], color: 'var(--dude-success)' },
  { tag: [tags.number, tags.bool, tags.null, tags.regexp], color: 'var(--dude-warning)' },
  { tag: [tags.function(tags.variableName), tags.definition(tags.variableName), tags.className], color: 'var(--dude-accent)' },
  { tag: [tags.propertyName, tags.attributeName], color: 'var(--dude-cat-developer-tint)' },
  { tag: tags.invalid, color: 'var(--dude-error)' },
]);

async function languageExtension(language: CodeEditorLanguage): Promise<Extension> {
  if (language === 'markdown') {
    const { markdown, markdownLanguage } = await import('@codemirror/lang-markdown');
    return markdown({ base: markdownLanguage });
  }
  if (language === 'javascript') {
    const { javascript } = await import('@codemirror/lang-javascript');
    return javascript();
  }
  return [];
}

/**
 * The remote cursor plugin writes a peer's `user.color` straight into a style attribute, so a peer's own
 * awareness state is never handed to it: names are truncated and colors are rebuilt from the peer's
 * `colorSlot` through the palette tokens.
 */
function guardedAwareness(awareness: Awareness): Awareness {
  return new Proxy(awareness, {
    get(target, property) {
      if (property === 'getStates') {
        return () => {
          const sanitized = new Map<number, Record<string, unknown>>();
          for (const [clientId, state] of target.getStates()) {
            const user = (state as { user?: { name?: unknown; colorSlot?: unknown } }).user;
            const name = typeof user?.name === 'string' && user.name ? user.name.slice(0, MAX_NAME_LENGTH) : 'Anonymous';
            sanitized.set(clientId, { ...state, user: { name, ...collabCursorColors(user?.colorSlot ?? clientId) } });
          }
          return sanitized;
        };
      }
      const value = Reflect.get(target, property, target);
      return typeof value === 'function' ? value.bind(target) : value;
    },
  });
}

function collabExtensions(binding: CodeEditorBinding): Extension {
  const awareness = binding.awareness;
  if (awareness) {
    // A collaboration session already stamped the Hub identity (`{ deviceId, name, colorSlot }`, the strict shape the Hub validates):
    // keep its device id and, unless the caller passes its own, its name and slot.
    const stamped = (awareness.getLocalState() as { user?: { deviceId?: unknown; name?: unknown; colorSlot?: unknown } } | null)?.user;
    const deviceId = typeof stamped?.deviceId === 'string' ? stamped.deviceId : null;
    const name = binding.user?.name ?? (deviceId !== null && typeof stamped?.name === 'string' ? stamped.name : 'Anonymous');
    const colorSlot = binding.user?.colorSlot ?? (deviceId !== null ? stamped?.colorSlot : undefined) ?? awareness.clientID;
    awareness.setLocalStateField('user', {
      ...(deviceId !== null ? { deviceId } : {}),
      name: name.slice(0, MAX_NAME_LENGTH),
      colorSlot: normalizeColorSlot(typeof colorSlot === 'number' ? colorSlot : awareness.clientID),
    });
  }
  const undoManager = binding.undoManager ?? new Y.UndoManager(binding.ytext);
  return [
    yCollab(binding.ytext, awareness ? guardedAwareness(awareness) : null, { undoManager }),
    keymap.of(yUndoManagerKeymap),
  ];
}

const plainEditingExtensions: Extension = [history(), keymap.of(historyKeymap)];

export async function mountCodeEditor(options: CodeEditorMountOptions): Promise<CodeEditorHandle> {
  const language = new Compartment();
  const readOnly = new Compartment();
  const placeholder = new Compartment();
  const aria = new Compartment();
  const theme = new Compartment();
  const editing = new Compartment();

  const readOnlyExtension = (value: boolean): Extension => [EditorState.readOnly.of(value), EditorView.editable.of(!value)];
  const ariaExtension = (label: string | null, labelledby: string | null): Extension =>
    EditorView.contentAttributes.of({
      ...(label ? { 'aria-label': label } : {}),
      ...(labelledby ? { 'aria-labelledby': labelledby } : {}),
      'aria-multiline': 'true',
      spellcheck: 'false',
    });

  // The current configuration, so a Yjs/plain switch (which builds a fresh state) keeps every setting.
  const config = {
    language: options.language,
    languageExtension: await languageExtension(options.language),
    readonly: options.readonly,
    placeholder: options.placeholder,
    ariaLabel: options.ariaLabel,
    ariaLabelledby: options.ariaLabelledby,
    binding: options.binding,
  };

  const createState = (doc: string, binding: CodeEditorBinding | null): EditorState =>
    EditorState.create({
      doc,
      extensions: [
        editing.of(binding ? collabExtensions(binding) : plainEditingExtensions),
        drawSelection(),
        search({ top: true }),
        keymap.of([...searchKeymap, ...defaultKeymap]),
        syntaxHighlighting(highlightStyle),
        EditorView.lineWrapping,
        theme.of(buildTheme(isDarkTheme())),
        language.of(config.languageExtension),
        readOnly.of(readOnlyExtension(config.readonly)),
        placeholder.of(placeholderExtension(config.placeholder)),
        aria.of(ariaExtension(config.ariaLabel, config.ariaLabelledby)),
        EditorView.updateListener.of((update) => {
          if (!update.docChanged) return;
          if (update.transactions.every((transaction) => transaction.annotation(programmatic))) return;
          options.onChange(update.state.doc.toString());
        }),
      ],
    });

  const view = new EditorView({
    parent: options.parent,
    state: createState(config.binding ? config.binding.ytext.toString() : options.doc, config.binding),
  });

  const onScroll = () => options.onScroll(view.scrollDOM);
  view.scrollDOM.addEventListener('scroll', onScroll, { passive: true });

  const clamp = (position: number): number => Math.max(0, Math.min(position, view.state.doc.length));

  return {
    getText: () => view.state.doc.toString(),
    setText(text) {
      if (view.state.doc.toString() === text) return;
      const head = view.state.selection.main.head;
      view.dispatch({
        changes: { from: 0, to: view.state.doc.length, insert: text },
        selection: EditorSelection.cursor(Math.min(head, text.length)),
        annotations: programmatic.of(true),
      });
    },
    getSelection(): CodeEditorSelection {
      const { from, to } = view.state.selection.main;
      return { start: from, end: to };
    },
    setSelection(start, end, reveal = false) {
      view.dispatch({ selection: EditorSelection.range(clamp(start), clamp(end)), scrollIntoView: reveal });
    },
    replaceRange(from, to, insert, selection) {
      const next = selection ?? { start: from + insert.length, end: from + insert.length };
      const length = view.state.doc.length - (to - from) + insert.length;
      const bound = (position: number) => Math.max(0, Math.min(position, length));
      view.dispatch({
        changes: { from, to, insert },
        selection: EditorSelection.range(bound(next.start), bound(next.end)),
        scrollIntoView: true,
      });
    },
    focus: () => view.focus(),
    hasFocus: () => view.hasFocus,
    scroller: () => view.scrollDOM,
    async setLanguage(next) {
      if (next === config.language) return;
      config.language = next;
      const extension = await languageExtension(next);
      if (config.language !== next) return;
      config.languageExtension = extension;
      view.dispatch({ effects: language.reconfigure(extension) });
    },
    setReadonly(value) {
      config.readonly = value;
      view.dispatch({ effects: readOnly.reconfigure(readOnlyExtension(value)) });
    },
    setPlaceholder(text) {
      config.placeholder = text;
      view.dispatch({ effects: placeholder.reconfigure(placeholderExtension(text)) });
    },
    setAria(label, labelledby) {
      config.ariaLabel = label;
      config.ariaLabelledby = labelledby;
      view.dispatch({ effects: aria.reconfigure(ariaExtension(label, labelledby)) });
    },
    setBinding(next, fallbackDoc) {
      if (next === config.binding) return;
      const selection = view.state.selection.main;
      config.binding = next;
      const doc = next ? next.ytext.toString() : fallbackDoc;
      view.setState(createState(doc, next));
      view.dispatch({
        selection: EditorSelection.range(Math.min(selection.anchor, doc.length), Math.min(selection.head, doc.length)),
      });
    },
    refreshTheme: () => view.dispatch({ effects: theme.reconfigure(buildTheme(isDarkTheme())) }),
    destroy() {
      view.scrollDOM.removeEventListener('scroll', onScroll);
      view.destroy();
    },
  };
}
