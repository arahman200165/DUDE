import { TestBed } from '@angular/core/testing';
import * as Y from 'yjs';
import { AppearanceService } from '../../../core/appearance/appearance.service';
import { CodeEditor } from './code-editor';
import { CODE_EDITOR_ENGINE_LOADER } from './code-editor.loader';
import type { CodeEditorBinding, CodeEditorEngine, CodeEditorHandle, CodeEditorMountOptions } from './code-editor.model';

function fakeEngine() {
  let text = '';
  let options!: CodeEditorMountOptions;
  const handle = {
    getText: vi.fn(() => text),
    setText: vi.fn((next: string) => void (text = next)),
    getSelection: vi.fn(() => ({ start: 1, end: 3 })),
    setSelection: vi.fn(),
    replaceRange: vi.fn(),
    focus: vi.fn(),
    hasFocus: vi.fn(() => false),
    scroller: vi.fn(() => document.createElement('div')),
    setLanguage: vi.fn(async () => {}),
    setReadonly: vi.fn(),
    setPlaceholder: vi.fn(),
    setAria: vi.fn(),
    setBinding: vi.fn(),
    refreshTheme: vi.fn(),
    destroy: vi.fn(),
  } satisfies CodeEditorHandle;
  const engine: CodeEditorEngine = {
    mountCodeEditor: vi.fn(async (mountOptions: CodeEditorMountOptions) => {
      options = mountOptions;
      text = mountOptions.doc;
      return handle;
    }),
  };
  return { engine, handle, options: () => options };
}

describe('CodeEditor', () => {
  function create(loader: () => Promise<CodeEditorEngine>, inputs: Record<string, unknown> = {}) {
    TestBed.configureTestingModule({ providers: [{ provide: CODE_EDITOR_ENGINE_LOADER, useValue: loader }] });
    const fixture = TestBed.createComponent(CodeEditor);
    for (const [name, value] of Object.entries(inputs)) fixture.componentRef.setInput(name, value);
    fixture.detectChanges();
    return fixture;
  }
  const textarea = (root: HTMLElement) => root.querySelector('textarea') as HTMLTextAreaElement | null;
  const ready = (fixture: ReturnType<typeof create>) => vi.waitFor(() => expect(fixture.componentInstance.engineState()).toBe('editor'));

  it('renders a working textarea first, then hands over to the loaded editor with the current text', async () => {
    const { engine, handle, options } = fakeEngine();
    let release!: () => void;
    const fixture = create(() => new Promise((resolve) => (release = () => resolve(engine))), {
      value: 'hello',
      placeholder: 'Type here',
      ariaLabel: 'Notes',
      language: 'markdown',
    });
    const root = fixture.nativeElement as HTMLElement;
    const fallback = textarea(root)!;
    expect(fallback.value).toBe('hello');
    expect(fallback.placeholder).toBe('Type here');
    expect(fallback.getAttribute('aria-label')).toBe('Notes');
    expect(root.getAttribute('data-code-editor-state')).toBe('loading');

    const changes: string[] = [];
    fixture.componentInstance.valueChange.subscribe((text) => changes.push(text));
    fallback.value = 'hello!';
    fallback.dispatchEvent(new Event('input'));
    expect(changes).toEqual(['hello!']);
    fixture.componentRef.setInput('value', 'hello!');

    release();
    await ready(fixture);
    fixture.detectChanges();

    expect(textarea(root)).toBeNull();
    expect(root.getAttribute('data-code-editor-state')).toBe('editor');
    expect(options()).toMatchObject({ doc: 'hello!', language: 'markdown', placeholder: 'Type here', ariaLabel: 'Notes', readonly: false, binding: null });
    expect(handle.setText).toHaveBeenCalledWith('hello!');
  });

  it('keeps the textarea, and editing working, when the engine cannot load', async () => {
    const fixture = create(() => Promise.reject(new Error('offline')), { value: 'abc' });
    await vi.waitFor(() => expect(fixture.componentInstance.engineState()).toBe('fallback'));
    fixture.detectChanges();

    const changes: string[] = [];
    fixture.componentInstance.valueChange.subscribe((text) => changes.push(text));
    const fallback = textarea(fixture.nativeElement)!;
    fallback.value = 'abcd';
    fallback.dispatchEvent(new Event('input'));
    expect(changes).toEqual(['abcd']);
    expect(fixture.componentInstance.getText()).toBe('abcd');
  });

  it('does not bind Tab in the fallback textarea, so focus can leave it', () => {
    const fixture = create(() => Promise.reject(new Error('offline')));
    const event = new KeyboardEvent('keydown', { key: 'Tab', bubbles: true, cancelable: true });
    textarea(fixture.nativeElement)!.dispatchEvent(event);
    expect(event.defaultPrevented).toBe(false);
  });

  it('pushes value, readonly, language, placeholder and aria changes into the editor', async () => {
    const { engine, handle } = fakeEngine();
    const fixture = create(async () => engine, { value: 'one' });
    await ready(fixture);

    fixture.componentRef.setInput('value', 'two');
    fixture.componentRef.setInput('readonly', true);
    fixture.componentRef.setInput('language', 'javascript');
    fixture.componentRef.setInput('placeholder', 'Write');
    fixture.componentRef.setInput('ariaLabel', 'Body');
    fixture.componentRef.setInput('ariaLabelledby', 'heading');
    fixture.detectChanges();

    expect(handle.setText).toHaveBeenLastCalledWith('two');
    expect(handle.setReadonly).toHaveBeenLastCalledWith(true);
    expect(handle.setLanguage).toHaveBeenLastCalledWith('javascript');
    expect(handle.setPlaceholder).toHaveBeenLastCalledWith('Write');
    expect(handle.setAria).toHaveBeenLastCalledWith('Body', 'heading');
  });

  it('applies inputs that changed while the editor was mounting (a read-only editor that went live stays editable)', async () => {
    const { handle } = fakeEngine();
    let finishMount!: () => void;
    const engine: CodeEditorEngine = { mountCodeEditor: vi.fn(() => new Promise<CodeEditorHandle>((resolve) => (finishMount = () => resolve(handle)))) };
    const fixture = create(async () => engine, { readonly: true, placeholder: 'Connecting', ariaLabel: 'Body' });
    await vi.waitFor(() => expect(engine.mountCodeEditor).toHaveBeenCalled());
    expect(vi.mocked(engine.mountCodeEditor).mock.calls[0]![0]).toMatchObject({ readonly: true, placeholder: 'Connecting' });

    fixture.componentRef.setInput('readonly', false);
    fixture.componentRef.setInput('placeholder', 'Write');
    fixture.componentRef.setInput('language', 'javascript');
    fixture.detectChanges();
    expect(handle.setReadonly).not.toHaveBeenCalled();

    finishMount();
    await ready(fixture);
    expect(handle.setReadonly).toHaveBeenCalledWith(false);
    expect(handle.setPlaceholder).toHaveBeenCalledWith('Write');
    expect(handle.setLanguage).toHaveBeenCalledWith('javascript');
    expect(handle.setAria).not.toHaveBeenCalled();
  });

  it('forwards edits and scrolling reported by the editor', async () => {
    const { engine, options } = fakeEngine();
    const fixture = create(async () => engine);
    await ready(fixture);

    const changes: string[] = [];
    const scrolled: HTMLElement[] = [];
    fixture.componentInstance.valueChange.subscribe((text) => changes.push(text));
    fixture.componentInstance.scrolled.subscribe((element) => scrolled.push(element));
    const scroller = document.createElement('div');
    options().onChange('typed');
    options().onScroll(scroller);

    expect(changes).toEqual(['typed']);
    expect(scrolled).toEqual([scroller]);
  });

  it('re-derives the theme when the appearance revision changes', async () => {
    const { engine, handle } = fakeEngine();
    const fixture = create(async () => engine);
    await ready(fixture);
    handle.refreshTheme.mockClear();

    TestBed.inject(AppearanceService).set({ mode: 'light' });
    fixture.detectChanges();
    await vi.waitFor(() => expect(handle.refreshTheme).toHaveBeenCalled());
  });

  it('uses the Yjs binding instead of the value input when a binding is provided', async () => {
    const { engine, handle, options } = fakeEngine();
    const binding: CodeEditorBinding = { ytext: new Y.Doc().getText('markdown'), user: { name: 'Host', colorSlot: 2 } };
    const fixture = create(async () => engine, { value: 'plain', binding });
    await ready(fixture);

    expect(options().binding).toBe(binding);
    expect(handle.setBinding).toHaveBeenCalledWith(binding, 'plain');
    expect(fixture.componentInstance.bound()).toBe(true);

    handle.setText.mockClear();
    fixture.componentRef.setInput('value', 'ignored while bound');
    fixture.detectChanges();
    expect(handle.setText).not.toHaveBeenCalled();

    fixture.componentRef.setInput('binding', null);
    fixture.detectChanges();
    expect(handle.setBinding).toHaveBeenLastCalledWith(null, 'ignored while bound');
    expect(handle.setText).toHaveBeenLastCalledWith('ignored while bound');
    expect(fixture.componentInstance.bound()).toBe(false);
  });

  it('exposes selection, replace and scroller helpers for toolbars', async () => {
    const { engine, handle } = fakeEngine();
    const fixture = create(async () => engine);
    await ready(fixture);
    const editor = fixture.componentInstance;

    expect(editor.getSelection()).toEqual({ start: 1, end: 3 });
    editor.replaceRange(1, 3, '**x**', { start: 3, end: 4 });
    expect(handle.replaceRange).toHaveBeenCalledWith(1, 3, '**x**', { start: 3, end: 4 });
    editor.setSelection(2, 5);
    expect(handle.setSelection).toHaveBeenCalledWith(2, 5, true);
    expect(editor.scroller()).toBeInstanceOf(HTMLElement);
  });

  it('applies replaceRange to the fallback textarea and reports the new text', () => {
    const fixture = create(() => Promise.reject(new Error('offline')), { value: 'abcdef' });
    const changes: string[] = [];
    fixture.componentInstance.valueChange.subscribe((text) => changes.push(text));

    fixture.componentInstance.replaceRange(1, 3, 'XY', { start: 1, end: 3 });

    expect(changes).toEqual(['aXYdef']);
    expect(fixture.componentInstance.getSelection()).toEqual({ start: 1, end: 3 });
  });

  it('destroys the editor with the component', async () => {
    const { engine, handle } = fakeEngine();
    const fixture = create(async () => engine);
    await ready(fixture);
    fixture.destroy();
    expect(handle.destroy).toHaveBeenCalledOnce();
  });
});
