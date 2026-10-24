import { TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { ScratchpadService } from '../../../core/workspace/scratchpad.service';
import { CodeEditor } from '../../../shared/components/code-editor/code-editor';
import { ScratchpadDrawer } from './scratchpad-drawer';

describe('ScratchpadDrawer note editor', () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
  });

  function openEditor() {
    const scratchpad = TestBed.inject(ScratchpadService);
    scratchpad.setDrawerExpanded(true);
    const snippet = scratchpad.addSnippet('Shopping', 'milk\neggs');
    const fixture = TestBed.createComponent(ScratchpadDrawer);
    fixture.detectChanges();
    const root = fixture.nativeElement as HTMLElement;
    const edit = Array.from(root.querySelectorAll('button')).find((button) => button.textContent?.trim() === 'Edit')!;
    edit.click();
    fixture.detectChanges();
    return { fixture, root, scratchpad, snippet };
  }

  it('edits the note body in the shared editor, labelled for screen readers, next to a plain title input', () => {
    const { fixture, root } = openEditor();

    const editor = fixture.debugElement.query(By.directive(CodeEditor)).componentInstance as CodeEditor;
    expect(editor.value()).toBe('milk\neggs');
    expect(editor.ariaLabel()).toBe('Note body');
    expect((root.querySelector('input[type="text"]') as HTMLInputElement).getAttribute('aria-label')).toBe('Note title');
    // jsdom never loads CodeMirror, so the editor shows its textarea fallback (the editor's test hook).
    expect((root.querySelector('app-code-editor textarea[data-code-editor-fallback]') as HTMLTextAreaElement).value).toBe('milk\neggs');
    // Not collaborative here (no Hub), so there is no version history to offer (PD-105).
    expect(root.querySelector('[data-scratchpad-history]')).toBeNull();
  });

  it('saves what was typed into the editor', () => {
    const { fixture, root, scratchpad, snippet } = openEditor();

    const textarea = root.querySelector('app-code-editor textarea[data-code-editor-fallback]') as HTMLTextAreaElement;
    textarea.value = 'milk\neggs\nbread';
    textarea.dispatchEvent(new Event('input'));
    fixture.detectChanges();

    const save = Array.from(root.querySelectorAll('button')).find((button) => button.textContent?.trim() === 'Save')!;
    save.click();
    fixture.detectChanges();

    expect(scratchpad.snippets().find((candidate) => candidate.id === snippet.id)?.body).toBe('milk\neggs\nbread');
    expect(root.querySelector('app-code-editor')).toBeNull();
  });

  it('shows a note changed on another device in the editor once the draft is reloaded', () => {
    const { fixture, root, scratchpad, snippet } = openEditor();
    scratchpad.updateSnippet(snippet.id, { body: 'changed elsewhere' });

    fixture.componentInstance['reloadDraft']();
    fixture.detectChanges();

    const editor = fixture.debugElement.query(By.directive(CodeEditor)).componentInstance as CodeEditor;
    expect(editor.value()).toBe('changed elsewhere');
    expect((root.querySelector('app-code-editor textarea') as HTMLTextAreaElement).value).toBe('changed elsewhere');
  });
});
