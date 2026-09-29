import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { fakeElectronBridge } from '../../core/platform/testing/fake-electron-bridge';
import { installBridge, removeBridge, settleFsJobs } from '../../core/platform/testing/recording-fs-bridge';
import { recordingSysBridge } from '../../core/platform/testing/recording-sys-bridge';
import { EnvironmentVariablesTool } from './environment-variables';

const reg = (name: string, type: string, data: string) => ({ name, type, rawType: 1, byteLength: 0, data });

describe('Environment Variables - confirmation boundary (DUDE_PRD.md 5.2.1)', () => {
  afterEach(() => { removeBridge(); localStorage.clear(); });

  async function render() {
    const { bridge, calls } = recordingSysBridge();
    const call = async (method: string, params: { hive: string }) => {
      if (method === 'reg.getValues') return { ok: true, data: { values: params.hive === 'HKCU' ? [reg('FOO', 'REG_SZ', 'bar')] : [] } };
      return { ok: false, error: 'unexpected ' + method };
    };
    installBridge(fakeElectronBridge({ ...bridge, sys: { ...bridge.sys, call: call as never } }));
    TestBed.configureTestingModule({ providers: [provideRouter([])] });
    const fixture = TestBed.createComponent(EnvironmentVariablesTool);
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
    const selectFoo = async () => {
      [...element.querySelectorAll<HTMLElement>('[role="row"]')].find((r) => r.textContent?.includes('FOO'))!.click();
      await settleFsJobs(fixture);
    };
    return { element, click, type, byId, calls, selectFoo };
  }

  const expectNothingApplied = (calls: { tokens: unknown[]; applies: unknown[] }) => {
    expect(calls.tokens).toEqual([]);
    expect(calls.applies).toEqual([]);
  };

  it('add only plans an env.set with the scope, name, value and expandable flag', async () => {
    const { click, type, byId, calls } = await render();
    await click('add');
    await type('editor-name', 'NEWVAR');
    await type('editor-value', '%USERPROFILE%\\x');
    byId('editor-expandable').click();
    await click('editor-preview');
    expect(calls.plans).toHaveLength(1);
    expect(calls.plans[0].tool).toBe('environment-variables');
    expect(calls.plans[0].ops).toEqual([{ kind: 'env.set', params: { scope: 'user', name: 'NEWVAR', value: '%USERPROFILE%\\x', expandable: true } }]);
    expectNothingApplied(calls);
  });

  it('an invalid name plans nothing', async () => {
    const { click, type, calls, element } = await render();
    await click('add');
    await type('editor-name', 'A=B');
    await click('editor-preview');
    expect(calls.plans).toEqual([]);
    expect(element.textContent).toContain('cannot contain');
  });

  it('edit only plans an env.set for the selected variable and its current type', async () => {
    const { click, type, calls, selectFoo } = await render();
    await selectFoo();
    await click('edit');
    await type('editor-value', 'baz');
    await click('editor-preview');
    expect(calls.plans[0].ops).toEqual([{ kind: 'env.set', params: { scope: 'user', name: 'FOO', value: 'baz', expandable: false } }]);
    expectNothingApplied(calls);
  });

  it('delete only plans an env.delete, and machine scope carries its scope', async () => {
    const { click, type, calls, selectFoo } = await render();
    await selectFoo();
    await click('delete');
    expect(calls.plans[0].ops).toEqual([{ kind: 'env.delete', params: { scope: 'user', name: 'FOO' } }]);
    expectNothingApplied(calls);

    await click('scope-machine');
    await click('add');
    await type('editor-name', 'M1');
    await type('editor-value', 'v');
    await click('editor-preview');
    expect(calls.plans[1].ops).toEqual([{ kind: 'env.set', params: { scope: 'machine', name: 'M1', value: 'v', expandable: false } }]);
    expectNothingApplied(calls);
  });

  it('volatile scope offers no edit controls', async () => {
    const { click, byId } = await render();
    await click('scope-volatile');
    expect(byId('add')).toBeNull();
    expect(byId('delete')).toBeNull();
  });

  it('applies only after the preview review and confirm steps', async () => {
    const { click, element, calls, selectFoo } = await render();
    await selectFoo();
    await click('delete');
    await click('system-change-review-apply');
    expectNothingApplied(calls);
    await click('system-change-confirm');
    expect(calls.tokens).toHaveLength(1);
    expect(calls.applies).toHaveLength(1);
    expect(element.textContent).toContain('new processes');
  });
});
