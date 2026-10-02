import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import type { ServiceConfig, ServiceListResult, ServiceSummary } from "@dude/contracts/system/system-types";
import { fakeElectronBridge } from '../../core/platform/testing/fake-electron-bridge';
import { installBridge, settleFsJobs } from '../../core/platform/testing/recording-fs-bridge';
import { recordingSysBridge } from '../../core/platform/testing/recording-sys-bridge';
import { ServicesViewerTool } from './services-viewer';

const summary = (name: string, state: ServiceSummary['state'], pid: number): ServiceSummary => ({ name, displayName: `${name} service`, pid, state, type: 'own-process' });

export const LISTING: ServiceListResult = {
  services: [summary('Spooler', 'running', 100), summary('Dnscache', 'stopped', 0), summary('Fax', 'running', 300), summary('RpcSs', 'running', 400)],
};

const config = (name: string, over: Partial<ServiceConfig>): ServiceConfig => ({
  name, displayName: `${name} service`, description: `${name} description`, state: 'running', type: 'own-process', startType: 'auto', pid: 1,
  binaryPath: `C:\\Windows\\System32\\${name}.exe`, account: 'LocalSystem', canPauseContinue: false, isDriver: false, dependencies: [], dependents: [], ...over,
});

export const CONFIGS: Record<string, ServiceConfig> = {
  Spooler: config('Spooler', { pid: 100, dependencies: ['RpcSs'], dependents: ['Fax'], canPauseContinue: true }),
  Dnscache: config('Dnscache', { state: 'stopped', pid: 0, startType: 'manual' }),
  Fax: config('Fax', { pid: 300, dependencies: ['Spooler'] }),
  RpcSs: config('RpcSs', { pid: 400, dependents: ['Spooler'] }),
};

/** Renders the tool on a desktop bridge with canned `svc.list`/`svc.config` that also records every helper call. */
export async function renderServices(options: Parameters<typeof recordingSysBridge>[0] = {}) {
  const { bridge, calls } = recordingSysBridge(options);
  const methods: string[] = [];
  const call = async (method: string, params: { name?: string }) => {
    methods.push(method);
    if (method === 'svc.list') return { ok: true, data: LISTING };
    if (method === 'svc.config') {
      const found = CONFIGS[params.name ?? ''];
      return found ? { ok: true, data: { config: found } } : { ok: false, error: 'not found' };
    }
    return { ok: false, error: 'unexpected ' + method };
  };
  installBridge(fakeElectronBridge({ ...bridge, sys: { ...bridge.sys, call: call as never } }));
  TestBed.configureTestingModule({ providers: [provideRouter([])] });
  const fixture = TestBed.createComponent(ServicesViewerTool);
  const element = fixture.nativeElement as HTMLElement;
  fixture.detectChanges();
  await settleFsJobs(fixture);
  [...element.querySelectorAll('button')].find((b) => b.textContent?.includes('Refresh now'))?.click();
  await settleFsJobs(fixture);
  const byId = (id: string) => element.querySelector<HTMLElement>(`[data-testid="${id}"]`)!;
  const click = async (id: string) => { byId(id).click(); await settleFsJobs(fixture); };
  const select = async (name: string) => {
    [...element.querySelectorAll<HTMLElement>('[role="row"]')].find((r) => r.textContent?.includes(name + ' service'))!.click();
    await settleFsJobs(fixture);
  };
  return { fixture, element, byId, click, select, calls, methods };
}
