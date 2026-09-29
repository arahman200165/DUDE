import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import type { ProcessListResult, ProcessSummary } from '../../../shared-logic/system/system-types';
import { fakeElectronBridge } from '../../core/platform/testing/fake-electron-bridge';
import { installBridge, removeBridge, settleFsJobs } from '../../core/platform/testing/recording-fs-bridge';
import { recordingSysBridge } from '../../core/platform/testing/recording-sys-bridge';
import { ProcessViewerTool } from './process-viewer';

const proc = (pid: number, name: string, startKey: string): ProcessSummary => ({
  pid, parentPid: 4, name, sessionId: 1, threadCount: 4, handleCount: 100, createTimeMs: 1_000 * pid, startKey,
  kernelTime100ns: 0, userTime100ns: 0, workingSetBytes: 1024, privateBytes: 1024, basePriority: 8,
});
const listing: ProcessListResult = { sampledAtMs: 1000, logicalProcessors: 4, processes: [proc(200, 'node.exe', '777001')] };
const ref = { pid: 200, startKey: '777001', name: 'node.exe' };

describe('Process Viewer - confirmation boundary (DUDE_PRD.md 5.2.1)', () => {
  afterEach(() => removeBridge());

  async function render(options: Parameters<typeof recordingSysBridge>[0] = {}) {
    const { bridge, calls } = recordingSysBridge(options);
    const call = async (method: string) => {
      if (method === 'process.list') return { ok: true, data: listing };
      if (method === 'process.detail') {
        return { ok: true, data: { pid: 200, startKey: '777001', imagePath: null, commandLine: null, currentDirectory: null, environment: null, user: null, integrityLevel: null, elevated: false, wow64: false, priorityClass: 'normal', affinityMask: '0xf', systemAffinityMask: '0xf', errors: {} } };
      }
      return { ok: false, error: 'unexpected ' + method };
    };
    installBridge(fakeElectronBridge({ ...bridge, sys: { ...bridge.sys, call: call as never } }));
    TestBed.configureTestingModule({ providers: [provideRouter([])] });
    const fixture = TestBed.createComponent(ProcessViewerTool);
    const element = fixture.nativeElement as HTMLElement;
    fixture.detectChanges();
    await settleFsJobs(fixture);
    [...element.querySelectorAll('button')].find((b) => b.textContent?.includes('Refresh now'))!.click();
    await settleFsJobs(fixture);
    const byId = (id: string) => element.querySelector<HTMLElement>(`[data-testid="${id}"]`)!;
    const click = async (id: string) => { byId(id).click(); await settleFsJobs(fixture); };
    const row = [...element.querySelectorAll<HTMLElement>('[role="row"]')].find((r) => r.textContent?.includes('node.exe'))!;
    row.click();
    await settleFsJobs(fixture);
    return { fixture, element, click, byId, calls };
  }

  const expectNothingApplied = (calls: { tokens: unknown[]; applies: unknown[] }) => {
    expect(calls.tokens).toEqual([]);
    expect(calls.applies).toEqual([]);
  };

  it.each([
    ['action-end', 'process.end'],
    ['action-end-tree', 'process.end-tree'],
    ['action-restart', 'process.restart'],
    ['action-suspend', 'process.suspend'],
    ['action-resume', 'process.resume'],
  ])('%s only plans %s with the selected instance and never issues a token or applies', async (testId, kind) => {
    const { click, calls } = await render();
    await click(testId);
    expect(calls.plans).toHaveLength(1);
    expect(calls.plans[0].tool).toBe('process-viewer');
    expect(calls.plans[0].ops).toEqual([{ kind, params: ref }]);
    expectNothingApplied(calls);
  });

  it('priority, affinity and dump previews plan with the right params and do not apply', async () => {
    const { click, byId, calls, fixture } = await render();
    await click('action-priority');
    const select = byId('priority-select') as unknown as HTMLSelectElement;
    select.value = 'high';
    select.dispatchEvent(new Event('change'));
    await click('priority-preview');
    expect(calls.plans[0].ops[0]).toEqual({ kind: 'process.set-priority', params: { ...ref, priorityClass: 'high' } });

    await click('action-affinity');
    byId('cpu-1').click();
    byId('cpu-3').click();
    await settleFsJobs(fixture);
    await click('affinity-preview');
    expect(calls.plans[1].ops[0]).toEqual({ kind: 'process.set-affinity', params: { ...ref, affinityMask: '0x5' } });

    await click('action-dump');
    const path = byId('dump-path') as unknown as HTMLInputElement;
    path.value = 'C:\\dumps\\node-200.dmp';
    path.dispatchEvent(new Event('input'));
    byId('dump-full').click();
    await settleFsJobs(fixture);
    await click('dump-preview');
    expect(calls.plans[2].ops[0]).toEqual({ kind: 'process.dump', params: { ...ref, outputPath: 'C:\\dumps\\node-200.dmp', full: true } });
    expectNothingApplied(calls);
  });

  it('applies only after the preview review and confirm steps', async () => {
    const { click, element, calls } = await render();
    await click('action-end');
    await click('system-change-review-apply');
    expectNothingApplied(calls);
    await click('system-change-confirm');
    expect(calls.tokens).toHaveLength(1);
    expect(calls.applies).toHaveLength(1);
    expect(element.textContent).toContain('1 applied');
  });

  it('a stale or rejected token surfaces an error and nothing is applied', async () => {
    const { click, element, calls } = await render({ tokenError: 'The preview expired; preview again.' });
    await click('action-end');
    await click('system-change-review-apply');
    await click('system-change-confirm');
    expect(calls.tokens).toHaveLength(1);
    expect(calls.applies).toEqual([]);
    expect(element.textContent).toContain('The preview expired');
  });
});
