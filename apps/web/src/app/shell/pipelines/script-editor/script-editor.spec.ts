import { TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { ActivatedRoute, convertToParamMap, provideRouter } from '@angular/router';
import { of } from 'rxjs';
import { CodeEditor } from '../../../shared/components/code-editor/code-editor';
import { ScriptEditor } from './script-editor';

describe('ScriptEditor body editor', () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
    const params = convertToParamMap({});
    TestBed.configureTestingModule({
      providers: [provideRouter([]), { provide: ActivatedRoute, useValue: { snapshot: { paramMap: params }, paramMap: of(params) } }],
    });
  });

  function create() {
    const fixture = TestBed.createComponent(ScriptEditor);
    fixture.detectChanges();
    const editor = fixture.debugElement.query(By.directive(CodeEditor)).componentInstance as CodeEditor;
    return { fixture, editor, root: fixture.nativeElement as HTMLElement };
  }

  it('edits the script body in the shared editor with JavaScript highlighting and an accessible name', () => {
    const { editor } = create();

    expect(editor.language()).toBe('javascript');
    expect(editor.ariaLabel()).toBe('Script body');
    expect(editor.placeholder()).toBe('return input.value.toUpperCase();');
    expect(editor.surface()).toBe('elevated');
  });

  it('writes edits into the script definition', () => {
    const { fixture, root } = create();

    const textarea = root.querySelector('app-code-editor textarea[data-code-editor-fallback]') as HTMLTextAreaElement;
    textarea.value = 'return input.value.trim();';
    textarea.dispatchEvent(new Event('input'));
    fixture.detectChanges();

    expect(fixture.componentInstance['script']().body).toBe('return input.value.trim();');
  });

  it('shows a body replaced from outside (a merged remote change) in the editor', () => {
    const { fixture, root } = create();

    fixture.componentInstance['updateField']('body', 'return 42;');
    fixture.detectChanges();

    expect((root.querySelector('app-code-editor textarea') as HTMLTextAreaElement).value).toBe('return 42;');
  });

  it('leaves the test-input box a plain textarea', () => {
    const { root } = create();
    expect(root.querySelectorAll('app-code-editor')).toHaveLength(1);
    expect(root.querySelector('textarea[placeholder^="Test input value"]')).not.toBeNull();
  });
});
