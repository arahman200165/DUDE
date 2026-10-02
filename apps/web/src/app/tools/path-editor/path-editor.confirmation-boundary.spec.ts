import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { fakeElectronBridge } from '../../core/platform/testing/fake-electron-bridge';
import { installBridge, removeBridge, settleFsJobs } from '../../core/platform/testing/recording-fs-bridge';
import { recordingSysBridge } from '../../core/platform/testing/recording-sys-bridge';
import { fakePathSysCall, USER_WINDOWSAPPS } from "@dude/tool-engine/tools/path-editor/path-editor.fixtures";
import { PathEditorTool } from './path-editor';

describe('PATH Editor - confirmation boundary (DUDE_PRD.md 5.2.1)', () => {
  afterEach(() => { removeBridge(); localStorage.clear(); });

  async function render() {
    const { bridge, calls } = recordingSysBridge();
    installBridge(fakeElectronBridge({ ...bridge, sys: { ...bridge.sys, call: fakePathSysCall([]) as never } }));
    TestBed.configureTestingModule({ providers: [provideRouter([])] });
    const fixture = TestBed.createComponent(PathEditorTool);
    const element = fixture.nativeElement as HTMLElement;
    fixture.detectChanges();
    await settleFsJobs(fixture);
    const byId = (id: string) => element.querySelector<HTMLElement>(`[data-testid="${id}"]`)!;
    const click = async (id: string) => { byId(id).click(); await settleFsJobs(fixture); };
    const type = async (id: string, value: string) => {
      const el = byId(id) as unknown as HTMLInputElement;
      el.value = value;
      el.dispatchEvent(new Event('input'));
      await settleFsJobs(fixture);
    };
    return { element, byId, click, type, calls };
  }

  it('reorder, add, remove and dedupe only change in-memory state', async () => {
    const { click, type, byId, calls } = await render();
    await click('down-0');
    await type('add-input', 'C:\\new');
    await click('add');
    await click('remove-2');
    await type('add-input', 'c:\\NODEB\\');
    await click('add');
    await click('dedupe');
    expect(byId('dirty')).toBeTruthy();
    expect(calls.plans).toEqual([]);
    expect(calls.tokens).toEqual([]);
    expect(calls.applies).toEqual([]);
  });

  it('Save only plans one env.set with the rebuilt raw value, scope and expandable flag', async () => {
    const { click, type, calls } = await render();
    await click('down-0');
    await type('add-input', 'C:\\new');
    await click('add');
    await click('remove-2'); // C:\gone after the move
    await click('save');
    expect(calls.plans).toHaveLength(1);
    expect(calls.plans[0].tool).toBe('path-editor');
    expect(calls.plans[0].ops).toEqual([{
      kind: 'env.set',
      params: { scope: 'user', name: 'PATH', value: `C:\\nodeB;${USER_WINDOWSAPPS};C:\\nodeA;C:\\new`, expandable: true },
    }]);
    expect(calls.tokens).toEqual([]);
    expect(calls.applies).toEqual([]);
  });

  it('dedupe keeps the first raw form and Save carries the deduplicated value', async () => {
    const { click, type, calls } = await render();
    await click('down-0');
    await type('add-input', 'c:\\NODEB\\');
    await click('add');
    await click('dedupe');
    await click('save');
    expect(calls.plans[0].ops[0]).toEqual({
      kind: 'env.set',
      params: { scope: 'user', name: 'PATH', value: `C:\\nodeB;${USER_WINDOWSAPPS};C:\\gone;C:\\nodeA`, expandable: true },
    });
  });

  it('machine scope plans with the machine scope', async () => {
    const { click, calls } = await render();
    await click('scope-machine');
    await click('down-0');
    await click('save');
    expect(calls.plans[0].ops).toEqual([{
      kind: 'env.set',
      params: { scope: 'machine', name: 'PATH', value: 'C:\\Python312;%SystemRoot%\\system32;C:\\nodeA', expandable: true },
    }]);
    expect(calls.applies).toEqual([]);
  });

  it('an unchanged PATH cannot be saved', async () => {
    const { byId } = await render();
    expect((byId('save') as HTMLButtonElement).disabled).toBe(true);
  });

  it('applies only after the preview review and confirm steps', async () => {
    const { click, element, calls } = await render();
    await click('down-0');
    await click('save');
    await click('system-change-review-apply');
    expect(calls.tokens).toEqual([]);
    expect(calls.applies).toEqual([]);
    await click('system-change-confirm');
    expect(calls.tokens).toHaveLength(1);
    expect(calls.applies).toHaveLength(1);
    expect(element.textContent).toContain('new processes');
  });
});
