import * as Y from 'yjs';
import { Awareness, applyAwarenessUpdate, encodeAwarenessUpdate } from 'y-protocols/awareness';
import { mountCodeEditor } from './code-editor.engine';
import { stubEditorLayout } from './testing/stub-layout';
import type { CodeEditorHandle, CodeEditorMountOptions } from './code-editor.model';

describe('CodeMirror editor engine', () => {
  let parent: HTMLElement;
  let handles: CodeEditorHandle[];
  let changes: string[];

  beforeAll(stubEditorLayout);

  beforeEach(() => {
    parent = document.createElement('div');
    document.body.appendChild(parent);
    handles = [];
    changes = [];
    document.documentElement.setAttribute('data-theme', 'dark');
  });

  afterEach(() => {
    for (const handle of handles) handle.destroy();
    parent.remove();
  });

  async function mount(overrides: Partial<CodeEditorMountOptions> = {}): Promise<CodeEditorHandle> {
    const handle = await mountCodeEditor({
      parent,
      doc: 'hello',
      language: 'markdown',
      placeholder: '',
      readonly: false,
      ariaLabel: 'Notes',
      ariaLabelledby: null,
      binding: null,
      onChange: (text) => changes.push(text),
      onScroll: () => {},
      ...overrides,
    });
    handles.push(handle);
    return handle;
  }

  it('mounts with the document, an accessible name and wrapping, and reports user edits only', async () => {
    const handle = await mount();
    const content = parent.querySelector('.cm-content') as HTMLElement;

    expect(handle.getText()).toBe('hello');
    expect(content.getAttribute('aria-label')).toBe('Notes');
    expect(content.getAttribute('aria-multiline')).toBe('true');
    expect(parent.querySelector('.cm-lineWrapping')).not.toBeNull();

    handle.setText('replaced');
    expect(handle.getText()).toBe('replaced');
    expect(changes).toEqual([]);

    handle.replaceRange(0, 8, 'typed');
    expect(changes).toEqual(['typed']);
  });

  it('never captures Tab, so keyboard users can leave the editor', async () => {
    await mount();
    const content = parent.querySelector('.cm-content') as HTMLElement;
    for (const shiftKey of [false, true]) {
      const event = new KeyboardEvent('keydown', { key: 'Tab', shiftKey, bubbles: true, cancelable: true });
      content.dispatchEvent(event);
      expect(event.defaultPrevented).toBe(false);
    }
    expect(changes).toEqual([]);
  });

  it('keeps selection helpers within the document and reports replacements', async () => {
    const handle = await mount({ doc: 'abcdef' });
    handle.setSelection(2, 4);
    expect(handle.getSelection()).toEqual({ start: 2, end: 4 });

    handle.replaceRange(2, 4, '**cd**', { start: 2, end: 8 });
    expect(handle.getText()).toBe('ab**cd**ef');
    expect(handle.getSelection()).toEqual({ start: 2, end: 8 });
    handle.setSelection(0, 999);
    expect(handle.getSelection()).toEqual({ start: 0, end: 10 });
  });

  it('applies readonly and aria changes', async () => {
    const handle = await mount();
    const content = parent.querySelector('.cm-content') as HTMLElement;

    handle.setReadonly(true);
    expect(content.getAttribute('contenteditable')).toBe('false');
    handle.setReadonly(false);
    expect(content.getAttribute('contenteditable')).toBe('true');

    handle.setAria('Body', 'heading');
    expect(content.getAttribute('aria-label')).toBe('Body');
    expect(content.getAttribute('aria-labelledby')).toBe('heading');
  });

  it('loads the language lazily and tokenizes with it', async () => {
    const handle = await mount({ language: 'plain', doc: 'return 1;' });
    expect(parent.querySelector('.cm-content span[class]')).toBeNull();
    await handle.setLanguage('javascript');
    expect(parent.querySelector('.cm-content span[class]')).not.toBeNull();
  });

  it('re-derives the light or dark base when the theme changes', async () => {
    const handle = await mount();
    const editor = parent.querySelector('.cm-editor') as HTMLElement;
    const dark = editor.className;

    document.documentElement.setAttribute('data-theme', 'light');
    handle.refreshTheme();
    expect(editor.className).not.toBe(dark);

    document.documentElement.setAttribute('data-theme', 'dark');
    handle.refreshTheme();
    expect(editor.className).toBe(dark);
  });

  describe('Yjs binding', () => {
    function peers(initial = 'hello world') {
      const local = new Y.Doc();
      const remote = new Y.Doc();
      remote.getText('markdown').insert(0, initial);
      Y.applyUpdate(local, Y.encodeStateAsUpdate(remote));
      local.on('update', (update: Uint8Array, origin: unknown) => origin !== 'remote' && Y.applyUpdate(remote, update, 'remote'));
      remote.on('update', (update: Uint8Array, origin: unknown) => origin !== 'remote' && Y.applyUpdate(local, update, 'remote'));
      return { local, remote, ytext: local.getText('markdown'), remoteText: remote.getText('markdown') };
    }

    it('starts from the shared text, not the plain value', async () => {
      const { ytext } = peers();
      const handle = await mount({ doc: 'plain value', binding: { ytext, awareness: new Awareness(ytext.doc!) } });
      expect(handle.getText()).toBe('hello world');
    });

    it('sends local edits into the Y.Text and reports them', async () => {
      const { ytext, remoteText } = peers();
      const handle = await mount({ binding: { ytext, awareness: new Awareness(ytext.doc!) } });

      handle.replaceRange(5, 5, ',');
      expect(ytext.toString()).toBe('hello, world');
      expect(remoteText.toString()).toBe('hello, world');
      expect(changes).toEqual(['hello, world']);
    });

    it('applies remote edits without moving the local cursor off its text', async () => {
      const { ytext, remoteText } = peers('hello world');
      const handle = await mount({ binding: { ytext, awareness: new Awareness(ytext.doc!) } });
      handle.setSelection(8, 8); // after "hello wo"

      remoteText.insert(0, 'Oh, ');

      expect(handle.getText()).toBe('Oh, hello world');
      expect(changes).toEqual(['Oh, hello world']);
      expect(handle.getSelection()).toEqual({ start: 12, end: 12 }); // still after "hello wo"
    });

    it('publishes local presence with a palette slot and renders peers from the slot, never from a peer color', async () => {
      const { ytext } = peers();
      const awareness = new Awareness(ytext.doc!);
      await mount({ binding: { ytext, awareness, user: { name: 'Host', colorSlot: 10 } } });
      expect(awareness.getLocalState()).toMatchObject({ user: { name: 'Host', colorSlot: 2 } });

      // A peer that tries to smuggle CSS through its awareness state.
      const peerDoc = new Y.Doc();
      Y.applyUpdate(peerDoc, Y.encodeStateAsUpdate(ytext.doc!));
      const peerAwareness = new Awareness(peerDoc);
      peerAwareness.setLocalState({
        user: { name: 'Mallory', color: 'red;background-image:url(//evil.example/x)', colorLight: 'red', colorSlot: 3 },
        cursor: {
          anchor: Y.createRelativePositionFromTypeIndex(peerDoc.getText('markdown'), 2),
          head: Y.createRelativePositionFromTypeIndex(peerDoc.getText('markdown'), 4),
        },
      });
      applyAwarenessUpdate(awareness, encodeAwarenessUpdate(peerAwareness, [peerDoc.clientID]), 'remote');

      const caret = parent.querySelector('.cm-ySelectionCaret') as HTMLElement;
      expect(caret).not.toBeNull();
      expect(caret.getAttribute('style')).toContain('var(--dude-cat-security)');
      expect(parent.innerHTML).not.toContain('evil.example');
      expect(caret.textContent).toContain('Mallory');
    });

    it('switches back to the plain document with the fallback text and keeps the selection in range', async () => {
      const { ytext } = peers();
      const handle = await mount({ binding: { ytext, awareness: new Awareness(ytext.doc!) } });
      handle.setSelection(11, 11);

      handle.setBinding(null, 'short');

      expect(handle.getText()).toBe('short');
      expect(handle.getSelection()).toEqual({ start: 5, end: 5 });
      handle.replaceRange(0, 0, 'x');
      expect(ytext.toString()).toBe('hello world');
    });
  });
});
