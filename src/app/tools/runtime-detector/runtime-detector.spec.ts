import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { fakeElectronBridge } from '../../core/platform/testing/fake-electron-bridge';
import { installBridge, removeBridge, settleFsJobs } from '../../core/platform/testing/recording-fs-bridge';
import { RuntimeDetectorTool } from './runtime-detector';

const reg = (name: string, type: string, data: string) => ({ name, type, rawType: 1, byteLength: 0, data });

const PROBE: Record<string, string[]> = {
  'c:\\nodea': ['node.exe'],
  'c:\\nodeb': ['node.exe'],
  'c:\\users\\me\\appdata\\local\\microsoft\\windowsapps': ['python.exe'],
  'c:\\python312': ['python.exe'],
  'c:\\jdk17\\bin': ['java.exe'],
};

function fakeSysCall(methods: string[]) {
  return async (method: string, params: { hive?: string; path?: string; dirs?: string[] }) => {
    methods.push(method);
    if (method === 'reg.getValues') {
      if (params.hive === 'HKLM' && params.path?.includes('Session Manager')) return { ok: true, data: { values: [reg('Path', 'REG_EXPAND_SZ', 'C:\\nodeA;C:\\Python312'), reg('JAVA_HOME', 'REG_SZ', 'C:\\jdk21')] } };
      if (params.path === 'Environment') return { ok: true, data: { values: [reg('Path', 'REG_EXPAND_SZ', '%USERPROFILE%\\AppData\\Local\\Microsoft\\WindowsApps;C:\\nodeB;C:\\jdk17\\bin')] } };
      if (params.path === 'Volatile Environment') return { ok: true, data: { values: [reg('USERPROFILE', 'REG_SZ', 'C:\\Users\\me'), reg('LOCALAPPDATA', 'REG_SZ', 'C:\\Users\\me\\AppData\\Local')] } };
      return { ok: false, error: 'not found', code: 2 };
    }
    if (method === 'reg.enumKey') return { ok: false, error: 'not found', code: 2 };
    if (method === 'fs.probeDirs') {
      return { ok: true, data: { dirs: (params.dirs ?? []).map((dir) => {
        const found = PROBE[dir.toLowerCase().replace(/\\+$/, '')];
        return found ? { dir, exists: true, isDirectory: true, executables: found } : { dir, exists: false, isDirectory: false, executables: [] };
      }) } };
    }
    if (method === 'file.version') {
      const p = (params as { path?: string }).path ?? '';
      if (/nodea/i.test(p)) return { ok: true, data: { fixed: { fileVersion: '18.0.0.0', productVersion: '18.0.0' }, strings: {} } };
      if (/nodeb/i.test(p)) return { ok: true, data: { fixed: { fileVersion: '22.1.0.0', productVersion: '22.1.0' }, strings: {} } };
      return { ok: false, error: 'no version' };
    }
    return { ok: false, error: 'unexpected ' + method };
  };
}

describe('RuntimeDetectorTool', () => {
  afterEach(() => { removeBridge(); localStorage.clear(); });

  async function render() {
    const methods: string[] = [];
    const probe = vi.fn(async (commands: readonly { id: string; exe: string }[]) => commands.map((c) => ({
      id: c.id, ok: true, stdout: /nodea/i.test(c.exe) ? 'v18.0.1' : /nodeb/i.test(c.exe) ? 'v22.1.0' : '', stderr: /java/i.test(c.exe) ? 'openjdk version "17.0.9" 2023' : '', exitCode: 0,
    })));
    installBridge(fakeElectronBridge({ sys: { ...fakeElectronBridge().sys, call: fakeSysCall(methods) as never, pwshStatus: async () => ({ available: false }), onEvent: () => () => {} }, runtime: { probe } }));
    TestBed.configureTestingModule({ providers: [provideRouter([])] });
    const fixture = TestBed.createComponent(RuntimeDetectorTool);
    const element = fixture.nativeElement as HTMLElement;
    fixture.detectChanges();
    await settleFsJobs(fixture);
    const byId = (id: string) => element.querySelector<HTMLElement>(`[data-testid="${id}"]`);
    const click = async (id: string) => { byId(id)!.click(); await settleFsJobs(fixture); };
    return { fixture, element, methods, probe, byId, click };
  }

  it('detects installs from PATH and flags conflicts without executing anything', async () => {
    const { element, byId, probe, methods } = await render();
    const text = element.textContent!;
    expect(text).toContain('C:\\nodeA\\node.exe');
    expect(text).toContain('18.0.0');
    expect(text).toContain('C:\\nodeB\\node.exe');
    expect(text).toContain('WindowsApps');
    expect(text).toContain('different versions on PATH');
    expect(text).toContain('JAVA_HOME does not match');
    expect(text).toContain('WindowsApps alias is on PATH');
    expect(byId('probe-preview')).toBeNull();
    expect(probe).not.toHaveBeenCalled();
    expect(methods.every((m) => ['reg.getValues', 'reg.enumKey', 'fs.probeDirs', 'file.version'].includes(m))).toBe(true);
  });

  it('previews the exact commands first and executes only on the second click', async () => {
    const { click, byId, probe, element } = await render();
    await click('preview-probes');
    expect(probe).not.toHaveBeenCalled();
    const commands = [...element.querySelectorAll('[data-testid="probe-command"]')].map((e) => e.textContent!.trim());
    expect(commands).toContain('C:\\nodeA\\node.exe --version');
    expect(commands).toContain('C:\\jdk17\\bin\\java.exe -version');
    expect(element.textContent).toContain('will be executed');

    await click('confirm-probes');
    expect(probe).toHaveBeenCalledTimes(1);
    expect(byId('probe-message')).toBeTruthy();
    expect(element.textContent).toContain('18.0.1');
    expect(element.textContent).toContain('17.0.9');
    expect(byId('probe-preview')).toBeNull();
  });

  it('cancelling the preview runs nothing', async () => {
    const { click, byId, probe } = await render();
    await click('preview-probes');
    await click('cancel-probes');
    expect(byId('probe-preview')).toBeNull();
    expect(probe).not.toHaveBeenCalled();
  });

  it('shows a desktop-only explanation on the web', () => {
    removeBridge();
    TestBed.configureTestingModule({ providers: [provideRouter([])] });
    const fixture = TestBed.createComponent(RuntimeDetectorTool);
    fixture.detectChanges();
    expect((fixture.nativeElement as HTMLElement).textContent).toContain('needs Desktop DUDE');
  });
});
