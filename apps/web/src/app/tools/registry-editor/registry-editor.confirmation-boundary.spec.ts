import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { fakeElectronBridge } from '../../core/platform/testing/fake-electron-bridge';
import { installBridge, removeBridge, settleFsJobs } from '../../core/platform/testing/recording-fs-bridge';
import { recordingSysBridge } from '../../core/platform/testing/recording-sys-bridge';
import { RegistryEditorTool } from './registry-editor';

const value = (name: string, type: string, data: unknown) => ({ name, type, rawType: 1, byteLength: 0, data });

describe('Registry Editor - confirmation boundary (DUDE_PRD.md 5.2.1)', () => {
  afterEach(() => { removeBridge(); localStorage.clear(); });

  async function render() {
    const { bridge, calls } = recordingSysBridge();
    const call = async (method: string, params: { hive: string; path: string }) => {
      if (method === 'reg.enumKey') {
        if (params.path === '') return { ok: true, data: { lastWriteMs: 0, subkeys: params.hive === 'HKCU' || params.hive === 'HKLM' ? [{ name: 'Software', subkeyCount: 0, valueCount: 1, lastWriteMs: 0 }] : [] } };
        return { ok: true, data: { lastWriteMs: 0, subkeys: [] } };
      }
      if (method === 'reg.getValues') return { ok: true, data: { values: [value('Existing', 'REG_SZ', 'old')] } };
      return { ok: false, error: 'unexpected ' + method };
    };
    installBridge(fakeElectronBridge({ ...bridge, sys: { ...bridge.sys, call: call as never } }));
    TestBed.configureTestingModule({ providers: [provideRouter([])] });
    const fixture = TestBed.createComponent(RegistryEditorTool);
    const element = fixture.nativeElement as HTMLElement;
    fixture.detectChanges();
    await settleFsJobs(fixture);
    const byId = (id: string) => [...element.querySelectorAll<HTMLElement>('[data-testid]')].find((e) => e.getAttribute('data-testid') === id)!;
    const click = async (id: string) => { byId(id).click(); await settleFsJobs(fixture); };
    const type = async (id: string, text: string, event = 'input') => {
      const el = byId(id) as unknown as HTMLInputElement;
      el.value = text;
      el.dispatchEvent(new Event(event));
      await settleFsJobs(fixture);
    };
    const open = async (hive: string) => {
      await click(`toggle-${hive}\\`);
      await click(`key-${hive}\\Software`);
    };
    const pickExisting = async () => {
      [...element.querySelectorAll<HTMLElement>('[role="row"]')].find((r) => r.textContent?.includes('Existing'))!.click();
      await settleFsJobs(fixture);
    };
    return { element, click, type, byId, calls, open, pickExisting };
  }

  const expectNothingApplied = (calls: { tokens: unknown[]; applies: unknown[] }) => {
    expect(calls.tokens).toEqual([]);
    expect(calls.applies).toEqual([]);
  };

  it('new value only plans a registry.setValue with hive, path, view, name, type and data', async () => {
    const { click, type, calls, open } = await render();
    await open('HKCU');
    await click('new-value');
    await type('editor-name', 'Count');
    await type('editor-type', 'REG_DWORD', 'change');
    await type('editor-data', '0x10');
    await click('editor-preview');
    expect(calls.plans).toHaveLength(1);
    expect(calls.plans[0].tool).toBe('registry-editor');
    expect(calls.plans[0].ops).toEqual([{ kind: 'registry.setValue', params: { hive: 'HKCU', path: 'Software', view: 'default', name: 'Count', type: 'REG_DWORD', data: 16 } }]);
    expectNothingApplied(calls);
  });

  it('an invalid DWORD plans nothing', async () => {
    const { click, type, calls, open, element } = await render();
    await open('HKCU');
    await click('new-value');
    await type('editor-type', 'REG_DWORD', 'change');
    await type('editor-data', 'nope');
    await click('editor-preview');
    expect(calls.plans).toEqual([]);
    expect(element.textContent).toContain('decimal number');
  });

  it('edit value plans a registry.setValue for the selected value under the chosen WOW64 view', async () => {
    const { click, type, calls, open, byId, pickExisting } = await render();
    await type('view', '32', 'change');
    await open('HKLM');
    await pickExisting();
    await click('edit-value');
    await type('editor-data', 'fresh');
    await click('editor-preview');
    expect(byId('editor-name')).toBeTruthy();
    expect(calls.plans[0].ops).toEqual([{ kind: 'registry.setValue', params: { hive: 'HKLM', path: 'Software', view: '32', name: 'Existing', type: 'REG_SZ', data: 'fresh' } }]);
    expectNothingApplied(calls);
  });

  it('delete value and new key only plan', async () => {
    const { click, type, calls, open, pickExisting } = await render();
    await open('HKCU');
    await pickExisting();
    await click('delete-value');
    expect(calls.plans[0].ops).toEqual([{ kind: 'registry.deleteValue', params: { hive: 'HKCU', path: 'Software', view: 'default', name: 'Existing' } }]);

    await click('new-key');
    await type('new-key-name', 'Child');
    await click('new-key-preview');
    expect(calls.plans[1].ops).toEqual([{ kind: 'registry.createKey', params: { hive: 'HKCU', path: 'Software\\Child', view: 'default' } }]);
    expectNothingApplied(calls);
  });

  it('applies only after the preview review and confirm steps', async () => {
    const { click, calls, open, pickExisting } = await render();
    await open('HKCU');
    await pickExisting();
    await click('delete-value');
    await click('system-change-review-apply');
    expectNothingApplied(calls);
    await click('system-change-confirm');
    expect(calls.tokens).toHaveLength(1);
    expect(calls.applies).toHaveLength(1);
  });
});
