import { TestBed } from '@angular/core/testing';
import { fakeElectronBridge } from '../../core/platform/testing/fake-electron-bridge';
import { installBridge, removeBridge, settleFsJobs } from '../../core/platform/testing/recording-fs-bridge';
import { EnvironmentVariablesTool } from './environment-variables';

const reg = (name: string, type: string, data: string) => ({ name, type, rawType: 1, byteLength: 0, data });
const HKLM_VALUES = [reg('Path', 'REG_EXPAND_SZ', 'C:\\Windows;C:\\old'), reg('ComSpec', 'REG_SZ', 'cmd.exe')];
const HKCU_VALUES = [reg('HOME2', 'REG_SZ', 'C:\\Users\\me'), reg('TOOLS', 'REG_EXPAND_SZ', '%HOME2%\\tools')];

describe('EnvironmentVariablesTool', () => {
  afterEach(() => { removeBridge(); localStorage.clear(); });

  function render(snapshots: Record<string, unknown> = {}) {
    const methods: string[] = [];
    const call = async (method: string, params: { hive: string; path: string }) => {
      methods.push(method);
      if (method !== 'reg.getValues') return { ok: false, error: 'unexpected ' + method };
      if (params.hive === 'HKLM') return { ok: true, data: { values: HKLM_VALUES } };
      return { ok: true, data: { values: params.path === 'Environment' ? HKCU_VALUES : [] } };
    };
    const base = fakeElectronBridge();
    const headers = Object.keys(snapshots).map((id) => ({ id, kind: 'env' as const, name: id, source: 's', createdAt: '2030-01-01T00:00:00Z', bytes: 1 }));
    installBridge(fakeElectronBridge({
      sys: { ...base.sys, call: call as never },
      sysSnapshots: {
        ...base.sysSnapshots,
        list: async () => ({ ok: true as const, value: headers }),
        get: async (_k: string, id: string) => ({ ok: true as const, value: { ...headers.find((h) => h.id === id)!, data: snapshots[id] } }),
      } as never,
    }));
    const fixture = TestBed.createComponent(EnvironmentVariablesTool);
    const element = fixture.nativeElement as HTMLElement;
    const byId = (id: string) => element.querySelector<HTMLElement>(`[data-testid="${id}"]`)!;
    const click = async (id: string) => { byId(id).click(); await settleFsJobs(fixture); };
    const change = async (id: string, value: string, event = 'change') => {
      const el = byId(id) as unknown as HTMLInputElement;
      el.value = value;
      el.dispatchEvent(new Event(event));
      await settleFsJobs(fixture);
    };
    return { fixture, element, methods, byId, click, change };
  }

  it('renders the user scope with raw and expanded values, reading only registry values', async () => {
    const { fixture, element, methods } = render();
    fixture.detectChanges();
    await settleFsJobs(fixture);
    expect(element.textContent).toContain('HOME2');
    expect(element.textContent).toContain('%HOME2%\\tools');
    expect(element.textContent).toContain('C:\\Users\\me\\tools');
    expect(element.querySelector('[data-testid="count"]')?.textContent).toContain('2 of 2');
    expect(methods.every((m) => m === 'reg.getValues')).toBe(true);
  });

  it('filters and switches scope', async () => {
    const { fixture, element, byId, click, change } = render();
    fixture.detectChanges();
    await settleFsJobs(fixture);
    await change('filter', 'tools', 'input');
    expect(byId('count').textContent).toContain('1 of 2');
    await click('scope-machine');
    await change('filter', '', 'input');
    expect(element.textContent).toContain('ComSpec');
    expect(element.textContent).toContain('REG_EXPAND_SZ');
  });

  it('diffs two live scopes with a PATH-aware breakdown', async () => {
    const { fixture, element, click, change } = render({ }) ;
    fixture.detectChanges();
    await settleFsJobs(fixture);
    await click('mode-compare');
    await change('source-a', 'machine');
    await change('source-b', 'paste');
    await change('paste-b', 'Path=C:\\Windows;C:\\new\nComSpec=cmd.exe', 'input');
    await click('run-compare');
    expect(element.querySelector('[data-testid="diff-result"]')).toBeTruthy();
    const breakdown = element.querySelector('[data-testid="path-breakdown"]')?.textContent ?? '';
    expect(breakdown).toContain('C:\\new');
    expect(breakdown).toContain('C:\\old');
  });

  it('diffs against a saved snapshot', async () => {
    const { fixture, element, click, change } = render({ snap1: { HOME2: 'C:\\other', TOOLS: '%HOME2%\\tools' } });
    fixture.detectChanges();
    await settleFsJobs(fixture);
    await click('mode-compare');
    await change('source-b', 'snapshot');
    await change('snapshot-b', 'snap1');
    await click('run-compare');
    expect(element.querySelector('[data-testid="diff-result"]')?.textContent).toContain('HOME2');
  });

  it('shows a desktop-only explanation on the web', () => {
    removeBridge();
    const fixture = TestBed.createComponent(EnvironmentVariablesTool);
    fixture.detectChanges();
    expect((fixture.nativeElement as HTMLElement).textContent).toContain('needs Desktop DUDE');
  });
});
