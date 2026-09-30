import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap, provideRouter } from '@angular/router';
import type { ProcessListResult, ProcessSummary } from '../../../shared-logic/system/system-types';
import { fakeElectronBridge } from '../../core/platform/testing/fake-electron-bridge';
import { installBridge, removeBridge, settleFsJobs } from '../../core/platform/testing/recording-fs-bridge';
import { ProcessViewerTool } from './process-viewer';

const proc = (pid: number, parentPid: number, name: string, cpu100ns = 0): ProcessSummary => ({
  pid, parentPid, name, sessionId: 1, threadCount: 4, handleCount: 100, createTimeMs: 1_000 * pid, startKey: String(pid),
  kernelTime100ns: cpu100ns, userTime100ns: 0, workingSetBytes: 5 * 1024 * 1024, privateBytes: 2 * 1024 * 1024, basePriority: 8,
});
const list = (at: number, cpu: number): ProcessListResult => ({
  sampledAtMs: at, logicalProcessors: 2, processes: [proc(4, 0, 'System'), proc(100, 4, 'explorer.exe', cpu), proc(200, 100, 'node.exe')],
});

describe('ProcessViewerTool', () => {
  afterEach(() => removeBridge());

  function render(query: Record<string, string> = {}) {
    const methods: string[] = [];
    let samples = 0;
    const call = async (method: string, params: unknown) => {
      methods.push(method);
      switch (method) {
        case 'process.list': return { ok: true, data: list(1000 + 1000 * samples, 1e7 * samples++) };
        case 'process.detail': return { ok: true, data: { pid: (params as { pid: number }).pid, startKey: '200', imagePath: 'C:\\node.exe', commandLine: 'node server.js', currentDirectory: 'C:\\', environment: { A: '1' }, user: { name: 'me', domain: 'PC', sid: 'S-1' }, integrityLevel: 'medium', elevated: false, wow64: false, priorityClass: 'normal', affinityMask: '0x3', systemAffinityMask: '0x3', errors: {} } };
        case 'process.modules': return { ok: true, data: { modules: [{ name: 'ntdll.dll', path: 'C:\\Windows\\ntdll.dll', baseAddress: '0x7ff', size: 4096 }] } };
        case 'svc.list': return { ok: true, data: { services: [] } };
        default: return { ok: false, error: 'unexpected ' + method };
      }
    };
    installBridge(fakeElectronBridge({ sys: { ...fakeElectronBridge().sys, call: call as never } }));
    TestBed.configureTestingModule({ providers: [provideRouter([]), { provide: ActivatedRoute, useValue: { snapshot: { queryParamMap: convertToParamMap(query) } } }] });
    const fixture = TestBed.createComponent(ProcessViewerTool);
    const element = fixture.nativeElement as HTMLElement;
    const clickText = async (selector: string, text: string) => {
      const target = [...element.querySelectorAll<HTMLElement>(selector)].find((el) => el.textContent?.includes(text));
      target!.click();
      await settleFsJobs(fixture);
    };
    return { fixture, element, methods, clickText };
  }

  it('lists processes, computes CPU across refreshes, and only issues read methods', async () => {
    const { fixture, element, methods, clickText } = render();
    fixture.detectChanges();
    await clickText('button', 'Refresh now');
    await clickText('button', 'Refresh now');
    expect(element.querySelector('[data-testid="process-count"]')?.textContent).toContain('3 of 3');
    expect(element.textContent).toContain('explorer.exe');
    expect(methods.every((m) => m.startsWith('process.') || m.startsWith('svc.') || m.startsWith('net.') || m.startsWith('file.') || m.startsWith('reg.') || m.startsWith('helper.'))).toBe(true);
  });

  it('filters by name and loads a selected process lazily', async () => {
    const { fixture, element, methods, clickText } = render();
    fixture.detectChanges();
    await clickText('button', 'Refresh now');
    const filter = element.querySelector<HTMLInputElement>('[data-testid="process-filter"]')!;
    filter.value = 'node';
    filter.dispatchEvent(new Event('input'));
    await settleFsJobs(fixture);
    expect(element.querySelector('[data-testid="process-count"]')?.textContent).toContain('1 of 3');

    expect(methods).not.toContain('process.detail');
    await clickText('[role="row"]', 'node.exe');
    expect(element.querySelector('[data-testid="command-line"]')?.textContent).toContain('node server.js');
    expect(methods).not.toContain('process.modules');
    await clickText('[role="tab"]', 'Modules');
    expect(element.textContent).toContain('ntdll.dll');
    expect(methods).toContain('process.modules');
  }, 30_000);

  it('a ?pid= link (no startKey) selects that PID and offers the diagnostic bundle hand-off', async () => {
    const { fixture, element, clickText } = render({ pid: '200' });
    fixture.detectChanges();
    await clickText('button', 'Refresh now');
    expect(element.querySelector('[data-testid="process-detail"]')?.textContent).toContain('node.exe');
    const link = element.querySelector<HTMLAnchorElement>('[data-testid="action-bundle"]')!;
    expect(link.getAttribute('href')).toContain('/tools/process-diagnostic-bundle');
    expect(link.getAttribute('href')).toContain('pid=200');
    expect(link.getAttribute('href')).toContain('startKey=200');
  });

  it('a ?pid= link for a PID that is not running shows a notice and selects nothing', async () => {
    const { fixture, element, clickText } = render({ pid: '9999' });
    fixture.detectChanges();
    await clickText('button', 'Refresh now');
    expect(element.querySelector('[data-testid="process-detail"]')).toBeNull();
    expect(element.textContent).toContain('No running process has that PID.');
  });

  it('shows a desktop-only explanation on the web', () => {
    TestBed.configureTestingModule({ providers: [provideRouter([])] });
    removeBridge();
    const fixture = TestBed.createComponent(ProcessViewerTool);
    fixture.detectChanges();
    expect((fixture.nativeElement as HTMLElement).textContent).toContain('needs Desktop DUDE');
  });
});
