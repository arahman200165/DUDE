import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import type { ProcessListResult, ProcessSummary, SocketTableResult } from "@dude/contracts/system/system-types";
import { fakeElectronBridge } from '../../core/platform/testing/fake-electron-bridge';
import { installBridge, removeBridge, settleFsJobs } from '../../core/platform/testing/recording-fs-bridge';
import { recordingSysBridge } from '../../core/platform/testing/recording-sys-bridge';
import { PortProcessLookupTool } from './port-process-lookup';

const proc = (pid: number, name: string, startKey: string): ProcessSummary => ({
  pid, parentPid: 4, name, sessionId: 1, threadCount: 4, handleCount: 100, createTimeMs: 1_000 * pid, startKey,
  kernelTime100ns: 0, userTime100ns: 0, workingSetBytes: 1024, privateBytes: 1024, basePriority: 8,
});
const processes: ProcessListResult = { sampledAtMs: 1000, logicalProcessors: 4, processes: [proc(200, 'node.exe', '777001'), proc(300, 'chrome.exe', '888002')] };
const tcp: SocketTableResult = {
  entries: [
    { protocol: 'tcp', family: 4, localAddress: '0.0.0.0', localPort: 3000, state: 'LISTEN', pid: 200 },
    { protocol: 'tcp', family: 4, localAddress: '127.0.0.1', localPort: 50000, remoteAddress: '127.0.0.1', remotePort: 3000, state: 'ESTABLISHED', pid: 300 },
  ],
};
const udp: SocketTableResult = { entries: [{ protocol: 'udp', family: 4, localAddress: '0.0.0.0', localPort: 5353, pid: 300 }] };

describe('Port to Process Lookup', () => {
  afterEach(() => removeBridge());

  async function render() {
    const { bridge, calls } = recordingSysBridge();
    const methods: string[] = [];
    const call = async (method: string) => {
      methods.push(method);
      if (method === 'net.tcp') return { ok: true, data: tcp };
      if (method === 'net.udp') return { ok: true, data: udp };
      if (method === 'process.list') return { ok: true, data: processes };
      return { ok: false, error: 'unexpected ' + method };
    };
    installBridge(fakeElectronBridge({ ...bridge, sys: { ...bridge.sys, call: call as never } }));
    TestBed.configureTestingModule({ providers: [provideRouter([])] });
    const fixture = TestBed.createComponent(PortProcessLookupTool);
    const element = fixture.nativeElement as HTMLElement;
    fixture.detectChanges();
    await settleFsJobs(fixture);
    [...element.querySelectorAll('button')].find((b) => b.textContent?.includes('Refresh now'))!.click();
    await settleFsJobs(fixture);
    const byId = (id: string) => element.querySelector<HTMLElement>(`[data-testid="${id}"]`)!;
    const click = async (id: string) => { byId(id).click(); await settleFsJobs(fixture); };
    return { fixture, element, byId, click, calls, methods };
  }

  it('renders the join and only uses read methods until an action', async () => {
    const { element, byId, calls, methods } = await render();
    expect(byId('port-count').textContent).toContain('3 of 3 sockets');
    expect(element.textContent).toContain('node.exe');
    expect(element.textContent).toContain('chrome.exe');
    expect(new Set(methods)).toEqual(new Set(['net.tcp', 'net.udp', 'process.list']));
    expect(calls.plans).toEqual([]);
    expect(calls.tokens).toEqual([]);
    expect(calls.applies).toEqual([]);
  });

  it('filters by port and listening-only', async () => {
    const { byId, fixture } = await render();
    const input = byId('port-filter') as unknown as HTMLInputElement;
    input.value = '3000';
    input.dispatchEvent(new Event('input'));
    await settleFsJobs(fixture);
    expect(byId('port-count').textContent).toContain('2 of 3');
    byId('listening-only').click();
    await settleFsJobs(fixture);
    expect(byId('port-count').textContent).toContain('1 of 3');
  });

  it('End owner only plans, with the row exact pid and startKey; apply follows review and confirm', async () => {
    const { click, element, byId, fixture, calls } = await render();
    const input = byId('port-filter') as unknown as HTMLInputElement;
    input.value = 'node';
    input.dispatchEvent(new Event('input'));
    await settleFsJobs(fixture);
    await click('end-owner');
    expect(calls.plans).toHaveLength(1);
    expect(calls.plans[0].tool).toBe('port-process-lookup');
    expect(calls.plans[0].ops).toEqual([{ kind: 'process.end', params: { pid: 200, startKey: '777001', name: 'node.exe' } }]);
    expect(calls.tokens).toEqual([]);
    expect(calls.applies).toEqual([]);

    await click('system-change-review-apply');
    expect(calls.tokens).toEqual([]);
    expect(calls.applies).toEqual([]);
    await click('system-change-confirm');
    expect(calls.tokens).toHaveLength(1);
    expect(calls.applies).toHaveLength(1);
    expect(element.textContent).toContain('1 applied');
  });
});
