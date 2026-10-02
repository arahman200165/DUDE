import { TestBed } from '@angular/core/testing';
import { fakeElectronBridge } from '../../core/platform/testing/fake-electron-bridge';
import { installBridge, removeBridge, settleFsJobs } from '../../core/platform/testing/recording-fs-bridge';
import { RegistryEditorTool } from './registry-editor';

const value = (name: string, type: string, data: unknown) => ({ name, type, rawType: 1, byteLength: 0, data });
const REG_TEXT = 'Windows Registry Editor Version 5.00\r\n\r\n[HKEY_CURRENT_USER\\Software\\Vendor]\r\n"Name"="new"\r\n"Gone2"=dword:00000001\r\n';

describe('RegistryEditorTool', () => {
  afterEach(() => { removeBridge(); localStorage.clear(); });

  function render(snapshotTree?: unknown) {
    const methods: string[] = [];
    let searchParams: unknown;
    const call = async (method: string, params: { hive: string; path: string }) => {
      methods.push(method);
      switch (method) {
        case 'reg.enumKey':
          if (params.path === '') return { ok: true, data: { lastWriteMs: 0, subkeys: params.hive === 'HKCU' ? [{ name: 'Software', subkeyCount: 1, valueCount: 0, lastWriteMs: 0 }] : [] } };
          if (params.path === 'Software') return { ok: true, data: { lastWriteMs: 0, subkeys: [{ name: 'Vendor', subkeyCount: 0, valueCount: 2, lastWriteMs: 0 }] } };
          return { ok: true, data: { lastWriteMs: 0, subkeys: [] } };
        case 'reg.getValues':
          return { ok: true, data: { values: [value('', 'REG_SZ', 'dflt'), value('Flags', 'REG_DWORD', 255), value('Blob', 'REG_BINARY', '0aff')] } };
        case 'reg.search':
          searchParams = params;
          return { ok: true, data: { matches: [{ keyPath: 'HKCU\\Software\\Vendor', matchIn: 'value-name', valueName: 'Flags', preview: '255' }], truncated: true, keysScanned: 3 } };
        case 'reg.export':
          return { ok: true, data: { text: REG_TEXT, keysExported: 1 } };
        default: return { ok: false, error: 'unexpected ' + method };
      }
    };
    const base = fakeElectronBridge();
    const headers = snapshotTree ? [{ id: 's1', kind: 'registry' as const, name: 'snap', source: 'HKCU', createdAt: '2030-01-01T00:00:00Z', bytes: 1 }] : [];
    installBridge(fakeElectronBridge({
      sys: { ...base.sys, call: call as never },
      sysSnapshots: {
        ...base.sysSnapshots,
        list: async () => ({ ok: true as const, value: headers }),
        get: async () => ({ ok: true as const, value: { ...headers[0], data: { tree: snapshotTree } } }),
      } as never,
    }));
    const fixture = TestBed.createComponent(RegistryEditorTool);
    const element = fixture.nativeElement as HTMLElement;
    const byId = (id: string) => [...element.querySelectorAll<HTMLElement>('[data-testid]')].find((e) => e.getAttribute('data-testid') === id)!;
    const click = async (id: string) => { byId(id).click(); await settleFsJobs(fixture); };
    const type = async (id: string, text: string, event = 'input') => {
      const el = byId(id) as unknown as HTMLInputElement;
      el.value = text;
      el.dispatchEvent(new Event(event));
      await settleFsJobs(fixture);
    };
    return { fixture, element, methods, byId, click, type, search: () => searchParams };
  }

  it('lazy-loads children on expand, renders typed values, and only reads', async () => {
    const { fixture, element, methods, click } = render();
    fixture.detectChanges();
    await settleFsJobs(fixture);
    expect(methods).toEqual([]);
    await click('toggle-HKCU\\');
    expect(methods).toEqual(['reg.enumKey']);
    expect(element.textContent).toContain('Software');
    await click('toggle-HKCU\\Software');
    await click('key-HKCU\\Software\\Vendor');
    expect(element.textContent).toContain('(Default)');
    expect(element.textContent).toContain('0x000000ff (255)');
    expect(element.textContent).toContain('0a ff');
    expect(methods.every((m) => m.startsWith('reg.'))).toBe(true);
  });

  it('navigates from a typed PowerShell path', async () => {
    const { fixture, element, click, type, byId } = render();
    fixture.detectChanges();
    await settleFsJobs(fixture);
    await type('path', 'HKCU:\\Software\\Vendor');
    await click('go');
    expect(byId('selected-path').textContent).toContain('HKCU\\Software\\Vendor');
    expect(element.textContent).toContain('Flags');
  });

  it('searches under the selected key, notes truncation and jumps to a hit', async () => {
    const { fixture, element, click, type, byId, search } = render();
    fixture.detectChanges();
    await settleFsJobs(fixture);
    await type('path', 'HKCU\\Software');
    await click('go');
    await click('panel-search');
    expect(byId('search-scope').textContent).toContain('HKCU\\Software');
    await type('search-query', 'Flags');
    await click('search-run');
    expect(search()).toMatchObject({ hive: 'HKCU', path: 'Software', query: 'Flags' });
    expect(byId('search-truncated')).toBeTruthy();
    await click('search-hit');
    expect(byId('selected-path').textContent).toContain('HKCU\\Software\\Vendor');
    expect(element.textContent).toContain('Flags');
  });

  it('diffs the live key against a saved snapshot', async () => {
    const { fixture, click, type, byId } = render({ 'HKEY_CURRENT_USER\\Software\\Vendor': { Name: { type: 'REG_SZ', data: 'old' }, Removed: { type: 'REG_SZ', data: 'x' } } });
    fixture.detectChanges();
    await settleFsJobs(fixture);
    await type('path', 'HKCU\\Software\\Vendor');
    await click('go');
    await click('panel-diff');
    await type('diff-snapshot', 's1', 'change');
    await click('run-compare');
    const text = byId('diff-result').textContent ?? '';
    expect(text).toContain('Name');
    expect(text).toContain('Removed');
    expect(text).toContain('Gone2');
  });

  it('shows a desktop-only explanation on the web', () => {
    removeBridge();
    const fixture = TestBed.createComponent(RegistryEditorTool);
    fixture.detectChanges();
    expect((fixture.nativeElement as HTMLElement).textContent).toContain('needs Desktop DUDE');
  });
});
