import { TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { ActivatedRoute, convertToParamMap, provideRouter } from '@angular/router';
import { of } from 'rxjs';
import { CodeEditor } from '../../../shared/components/code-editor/code-editor';
import { ScriptEditor } from './script-editor';
import { signal } from '@angular/core';
import { createUserScript } from '@dude/domain/core/pipeline/pipeline.model';
import { HUB_COLLAB } from '../../../core/collab/hub-collab.token';
import { FakeCollabHub, FakeCollabTransport } from '../../../core/collab/testing/fake-collab-hub';
import { SyncStatusService } from '../../../core/sync/sync-status.service';
import { UserScriptStoreService } from '../../../core/pipeline/user-script-store.service';

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

describe('ScriptEditor collaborative body (PD-099)', () => {
  const ALICE = { deviceId: 'dev-alice', name: 'Alice', colorSlot: 1 };

  async function setup(saved: boolean) {
    localStorage.clear();
    sessionStorage.clear();
    const script = { ...createUserScript('Shared'), body: 'return 1;' };
    const params = convertToParamMap({ id: script.id });
    const hub = new FakeCollabHub();
    const transport = new FakeCollabTransport(hub, ALICE);
    TestBed.configureTestingModule({
      providers: [
        provideRouter([]),
        { provide: ActivatedRoute, useValue: { snapshot: { paramMap: params }, paramMap: of(params) } },
        { provide: HUB_COLLAB, useValue: transport },
        { provide: SyncStatusService, useValue: { status: signal({ pending: 0 }) } },
      ],
    });
    if (saved) await TestBed.inject(UserScriptStoreService).save(script);
    hub.room(`user-script:${script.id}`).doc.getText('body').insert(0, 'return 1;');
    const fixture = TestBed.createComponent(ScriptEditor);
    fixture.detectChanges();
    TestBed.tick();
    if (transport.started.length > 0) transport.welcome();
    for (let i = 0; i < 3; i += 1) { TestBed.tick(); hub.pump(); }
    fixture.detectChanges();
    const editor = fixture.debugElement.query(By.directive(CodeEditor)).componentInstance as CodeEditor;
    return { fixture, editor, hub, script, transport };
  }

  it('binds a saved script body to the shared document and keeps the form in step with remote edits', async () => {
    const { fixture, editor, hub, script } = await setup(true);
    const component = fixture.componentInstance;
    expect(component['collab'].mode()).toBe('live');
    expect(editor.binding()).not.toBeNull();
    expect(fixture.nativeElement.querySelector('[data-script-live]')).not.toBeNull();

    hub.room(`user-script:${script.id}`).doc.getText('body').insert(0, '// hi\n');
    hub.pump();
    TestBed.tick();
    expect(component['script']().body).toBe('// hi\nreturn 1;');
  });

  it('writes a fallback-textarea edit into the shared text while live', async () => {
    const { fixture, hub, script } = await setup(true);
    fixture.componentInstance['onBodyChange']('return 2;');
    hub.pump();
    TestBed.tick();
    expect(hub.text(`user-script:${script.id}`)).toBe('return 2;');
    expect(fixture.componentInstance['script']().body).toBe('return 2;');
  });

  it('keeps an unsaved script local', async () => {
    const { fixture, editor, transport } = await setup(false);
    expect(fixture.componentInstance['collab'].mode()).toBe('local');
    expect(editor.binding()).toBeNull();
    expect(transport.started).toHaveLength(0);
  });
});
