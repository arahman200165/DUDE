import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap, provideRouter } from '@angular/router';
import { of } from 'rxjs';
import type { BundleEstimate, BundleWriteRequest } from '../../../shared-logic/system/bundle-types';
import { estimateSections } from '../../../shared-logic/system/bundle-types';
import type { ProcessListResult, ProcessSummary } from '../../../shared-logic/system/system-types';
import { fakeElectronBridge } from '../../core/platform/testing/fake-electron-bridge';
import { installBridge, removeBridge, settleFsJobs } from '../../core/platform/testing/recording-fs-bridge';
import { recordingSysBridge } from '../../core/platform/testing/recording-sys-bridge';
import { ProcessDiagnosticBundleTool } from './process-diagnostic-bundle';

const proc = (pid: number, name: string, startKey: string): ProcessSummary => ({
  pid, parentPid: 4, name, sessionId: 1, threadCount: 4, handleCount: 100, createTimeMs: 1_000 * pid, startKey,
  kernelTime100ns: 0, userTime100ns: 0, workingSetBytes: 1024, privateBytes: 4096, basePriority: 8,
});
const listing: ProcessListResult = { sampledAtMs: 1000, logicalProcessors: 4, processes: [proc(200, 'node.exe', '777001'), proc(300, 'chrome.exe', '888002')] };
const counts = { treeNodes: 2, commandLineChars: 50, envBytes: 900, modules: 10, threads: 4, handles: 100, ports: 1, privateBytes: 4096, workingSetBytes: 1024 };

describe('Process Diagnostic Bundle - confirmation boundary (DUDE_PRD.md 5.2.1)', () => {
  beforeEach(() => localStorage.clear());
  afterEach(() => removeBridge());

  async function render(options: { pickResult?: { canceled: true } | { canceled: false; path: string; name: string }; query?: Record<string, string>; elevated?: boolean } = {}) {
    const { bridge, calls } = recordingSysBridge();
    const bundleCalls = { estimates: [] as unknown[], writes: [] as BundleWriteRequest[], cancels: [] as string[] };
    const picks: unknown[] = [];
    const methods: string[] = [];
    const call = async (method: string) => {
      methods.push(method);
      if (method === 'process.list') return { ok: true, data: listing };
      return { ok: false, error: 'unexpected ' + method };
    };
    const pick = options.pickResult ?? { canceled: false as const, path: 'C:\\out\\bundle.zip', name: 'bundle.zip' };
    installBridge(fakeElectronBridge({
      ...bridge,
      sys: { ...bridge.sys, call: call as never },
      fs: { ...fakeElectronBridge().fs, pickSavePath: async (request) => { picks.push(request); return pick; } },
      sysBundle: {
        estimate: async (request) => {
          bundleCalls.estimates.push(request);
          const estimate: BundleEstimate = { target: { pid: request.pid, startKey: request.startKey, name: 'node.exe' }, elevated: options.elevated ?? true, counts, sections: estimateSections(counts, request.options, options.elevated ?? true) };
          return { ok: true as const, value: estimate };
        },
        write: async (request) => { bundleCalls.writes.push(request); return { ok: true as const, value: { path: request.savePath, bytes: 1234, sections: [] } }; },
        cancel: async (id) => { bundleCalls.cancels.push(id); return true; },
        reveal: async () => true,
        onProgress: () => () => {},
      },
    }));
    TestBed.configureTestingModule({ providers: [provideRouter([]), { provide: ActivatedRoute, useValue: { queryParamMap: of(convertToParamMap(options.query ?? {})), snapshot: {} } }] });
    const fixture = TestBed.createComponent(ProcessDiagnosticBundleTool);
    const element = fixture.nativeElement as HTMLElement;
    fixture.detectChanges();
    await settleFsJobs(fixture);
    const byId = (id: string) => element.querySelector<HTMLElement>(`[data-testid="${id}"]`)!;
    const click = async (id: string) => { byId(id).click(); await settleFsJobs(fixture); };
    return { fixture, element, byId, click, calls, bundleCalls, picks, methods };
  }

  const nothingWritten = (r: { bundleCalls: { writes: unknown[] }; picks: unknown[]; calls: { plans: unknown[]; tokens: unknown[]; applies: unknown[] } }) => {
    expect(r.bundleCalls.writes).toEqual([]);
    expect(r.picks).toEqual([]);
    expect(r.calls.plans).toEqual([]);
    expect(r.calls.tokens).toEqual([]);
    expect(r.calls.applies).toEqual([]);
  };

  it('choosing a process, toggling sections and changing options only estimate; nothing is saved or dumped', async () => {
    const r = await render();
    await r.click('target-200');
    expect(r.bundleCalls.estimates).toHaveLength(1);
    expect(r.byId('target-name').textContent).toContain('node.exe');
    await r.click('section-minidump');
    await r.click('section-env');
    await r.click('full-dump');
    await r.click('all-off');
    await r.click('all-on');
    const hours = r.byId('event-hours') as unknown as HTMLInputElement;
    hours.value = '48';
    hours.dispatchEvent(new Event('change'));
    await settleFsJobs(r.fixture);
    nothingWritten(r);
  });

  it('shows every section on by default with a field list and a size, minidump included', async () => {
    const r = await render();
    await r.click('target-200');
    for (const id of ['target', 'tree', 'cmdline', 'env', 'modules', 'threads', 'handles', 'ports', 'events', 'samples', 'minidump']) {
      expect((r.byId('section-' + id) as unknown as HTMLInputElement).checked, id).toBe(true);
      expect(r.byId('size-' + id).textContent, id).toContain('≈');
    }
    expect(r.byId('total-size').textContent).toContain('≈');
    expect(r.byId('size-warning').textContent).toMatch(/secrets/);
  });

  it('a ?pid= hand-off selects and estimates that process but does not export', async () => {
    const r = await render({ query: { pid: '200' } });
    expect(r.byId('target-name').textContent).toContain('PID 200');
    expect(r.bundleCalls.estimates).toHaveLength(1);
    nothingWritten(r);
  });

  it('a hand-off for a process that is gone shows a notice and no estimate', async () => {
    const r = await render({ query: { pid: '999' } });
    expect(r.byId('route-notice').textContent).toContain('No running process');
    expect(r.bundleCalls.estimates).toEqual([]);
  });

  it('Export opens the save dialog first; cancelling it writes nothing', async () => {
    const r = await render({ pickResult: { canceled: true } });
    await r.click('target-200');
    await r.click('export');
    expect(r.picks).toHaveLength(1);
    expect((r.picks[0] as { defaultName: string }).defaultName).toMatch(/^node\.exe-200-.*-diagnostic-bundle\.zip$/);
    expect(r.bundleCalls.writes).toEqual([]);
    expect(r.calls.applies).toEqual([]);
  });

  it('a confirmed save writes exactly once with the dialog path, the instance and the selected sections', async () => {
    const r = await render();
    await r.click('target-200');
    await r.click('section-env');
    await r.click('full-dump');
    await r.click('export');
    expect(r.picks).toHaveLength(1);
    expect(r.bundleCalls.writes).toHaveLength(1);
    const write = r.bundleCalls.writes[0];
    expect(write.savePath).toBe('C:\\out\\bundle.zip');
    expect(write.pid).toBe(200);
    expect(write.startKey).toBe('777001');
    expect(write.sections.env).toBe(false);
    expect(write.sections.minidump).toBe(true);
    expect(write.options).toEqual({ eventHours: 24, sampleSeconds: 10, fullDump: true });
    expect(write.exportId).toMatch(/^[A-Za-z0-9_-]{8,64}$/);
    expect(r.byId('export-done').textContent).toContain('C:\\out\\bundle.zip');
    // The bundle never goes through the system-change engine.
    expect(r.calls.plans).toEqual([]);
    expect(r.calls.applies).toEqual([]);
  });

  it('Export is disabled before a process is chosen and when no section is selected', async () => {
    const r = await render();
    expect(r.byId('export')).toBeNull();
    await r.click('target-200');
    await r.click('all-off');
    expect((r.byId('export') as unknown as HTMLButtonElement).disabled).toBe(true);
    (r.byId('export') as unknown as HTMLButtonElement).click();
    await settleFsJobs(r.fixture);
    nothingWritten(r);
  });

  it('flags handles when the session is not elevated', async () => {
    const r = await render({ elevated: false });
    await r.click('target-200');
    expect(r.element.textContent).toMatch(/elevated/i);
  });
});
