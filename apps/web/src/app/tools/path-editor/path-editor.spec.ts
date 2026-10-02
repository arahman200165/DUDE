import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { fakeElectronBridge } from '../../core/platform/testing/fake-electron-bridge';
import { installBridge, removeBridge, settleFsJobs } from '../../core/platform/testing/recording-fs-bridge';
import { recordingSysBridge } from '../../core/platform/testing/recording-sys-bridge';
import { fakePathSysCall } from "@dude/tool-engine/tools/path-editor/path-editor.fixtures";
import { PathEditorTool } from './path-editor';

describe('PathEditorTool', () => {
  afterEach(() => { removeBridge(); localStorage.clear(); });

  async function render() {
    const methods: string[] = [];
    const { bridge, calls } = recordingSysBridge();
    installBridge(fakeElectronBridge({ ...bridge, sys: { ...bridge.sys, call: fakePathSysCall(methods) as never } }));
    TestBed.configureTestingModule({ providers: [provideRouter([])] });
    const fixture = TestBed.createComponent(PathEditorTool);
    const element = fixture.nativeElement as HTMLElement;
    fixture.detectChanges();
    await settleFsJobs(fixture);
    const byId = (id: string) => element.querySelector<HTMLElement>(`[data-testid="${id}"]`);
    const click = async (id: string) => { byId(id)!.click(); await settleFsJobs(fixture); };
    return { fixture, element, methods, calls, byId, click };
  }

  it('shows per-entry badges for the user PATH and reads only registry values and directory probes', async () => {
    const { element, methods, byId, calls } = await render();
    expect(byId('badge-0-exists')).toBeTruthy();
    expect(byId('badge-1-exists')).toBeTruthy();
    expect(byId('badge-2-missing')).toBeTruthy();
    expect(element.textContent).toContain('C:\\Users\\me\\AppData\\Local\\Microsoft\\WindowsApps');
    expect(new Set(methods)).toEqual(new Set(['reg.getValues', 'fs.probeDirs']));
    expect(calls.plans).toEqual([]);
  });

  it('detects shadowed executables on the effective PATH, machine first', async () => {
    const { byId } = await render();
    const node = byId('shadow-node')!.textContent!;
    expect(node).toContain('C:\\nodeA\\node.exe');
    expect(node).toContain('shadowed: C:\\nodeB\\node.exe');
    const python = byId('shadow-python')!.textContent!;
    expect(python).toContain('C:\\Python312\\python.exe');
    expect(python).toContain('App Execution Alias');
    expect(byId('shadow-winget')).toBeNull();
  });

  it('the effective view is read-only, tags scopes and flags the cross-scope duplicate', async () => {
    const { click, byId } = await render();
    await click('scope-effective');
    expect(byId('effective-note')).toBeTruthy();
    expect(byId('save')).toBeNull();
    expect(byId('up-0')).toBeNull();
    expect(byId('scope-badge-0')!.textContent).toContain('machine');
    expect(byId('scope-badge-3')!.textContent).toContain('user');
    expect(byId('badge-6-duplicate')).toBeTruthy();
  });

  it('editing marks the list dirty without any write', async () => {
    const { click, byId, methods } = await render();
    await click('down-0');
    expect(byId('dirty')).toBeTruthy();
    expect(methods.every((m) => m === 'reg.getValues' || m === 'fs.probeDirs')).toBe(true);
  });

  it('shows a desktop-only explanation on the web', () => {
    removeBridge();
    TestBed.configureTestingModule({ providers: [provideRouter([])] });
    const fixture = TestBed.createComponent(PathEditorTool);
    fixture.detectChanges();
    expect((fixture.nativeElement as HTMLElement).textContent).toContain('needs Desktop DUDE');
  });
});
