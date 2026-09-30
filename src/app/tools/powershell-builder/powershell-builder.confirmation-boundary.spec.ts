import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import type { PowerShellRunEvent, PowerShellRunPreview } from '../../../shared-logic/system/powershell-types';
import { fakeElectronBridge } from '../../core/platform/testing/fake-electron-bridge';
import { installBridge, removeBridge, settleFsJobs } from '../../core/platform/testing/recording-fs-bridge';
import { PowerShellBuilderTool } from './powershell-builder';

const catalog = [{
  name: 'Get-Process',
  parameterSets: [{ name: 'Name', parameters: [{ name: 'Name', type: 'string[]' as const, mandatory: false }] }],
}];

function recordingPowerShell() {
  const calls = { previews: [] as { script: string; cwd: string }[], confirms: [] as string[], runs: [] as { previewId: string; token: string }[], discards: [] as string[], cancels: [] as string[] };
  let listener: (event: PowerShellRunEvent) => void = () => {};
  const powershell = {
    catalog: async () => ({ version: '7.6.0', commands: catalog }),
    preview: async (script: string, cwd: string): Promise<PowerShellRunPreview> => {
      calls.previews.push({ script, cwd });
      return { previewId: `preview-${calls.previews.length}`, script, sha256: 'a'.repeat(64), cwd: cwd || 'C:\\Users\\me', elevated: false, warnings: [], expiresAt: '2030-01-01T00:00:00.000Z' };
    },
    discard: async (id: string) => { calls.discards.push(id); return true; },
    confirm: async (id: string) => { calls.confirms.push(id); return { token: `token-${calls.confirms.length}`, expiresAt: '2030-01-01T00:01:00.000Z' }; },
    run: async (previewId: string, token: string) => { calls.runs.push({ previewId, token }); return { runId: 'run-1' }; },
    cancel: async (id: string) => { calls.cancels.push(id); return true; },
    history: async () => [{ id: 'old', sha256: 'b'.repeat(64), cwd: 'C:\\work', elevated: false, startedAt: '2030-01-01T00:00:00.000Z', completedAt: '2030-01-01T00:00:01.000Z', exitCode: 0, timedOut: false, cancelled: false, truncated: false }],
    clearHistory: async () => {},
    onEvent: (callback: (event: PowerShellRunEvent) => void) => { listener = callback; return () => {}; },
  };
  return { powershell, calls, emit: (event: PowerShellRunEvent) => listener(event) };
}

describe('PowerShell Builder confirmation boundary (DUDE_PRD.md §5.2.1)', () => {
  beforeEach(() => localStorage.clear());
  afterEach(() => removeBridge());

  it('never runs while building, editing, loading the catalog or restoring history; runs only after preview and a separate confirm', async () => {
    const { powershell, calls, emit } = recordingPowerShell();
    const base = fakeElectronBridge();
    localStorage.setItem('dude:v1:powershell-builder:saved', JSON.stringify({ ['b'.repeat(64)]: { script: 'Remove-Item C:\\old', at: '2030-01-01T00:00:00.000Z' } }));
    installBridge({
      ...base,
      sys: { ...base.sys, pwshStatus: async () => ({ available: true, path: 'pwsh.exe', version: '7.6.0', source: 'path' }) },
      powershell,
    });
    TestBed.configureTestingModule({ providers: [provideRouter([])] });
    const fixture = TestBed.createComponent(PowerShellBuilderTool);
    const element = fixture.nativeElement as HTMLElement;
    fixture.detectChanges();
    await settleFsJobs(fixture);
    const nothingStarted = () => { expect(calls.confirms).toEqual([]); expect(calls.runs).toEqual([]); };
    nothingStarted();

    // Building from the catalog only fills the script text.
    const cmdlet = element.querySelector<HTMLInputElement>('[data-testid="cmdlet-0"]')!;
    cmdlet.value = 'Get-Process';
    cmdlet.dispatchEvent(new Event('change'));
    await settleFsJobs(fixture);
    expect((element.querySelector('[data-testid="script"]') as HTMLTextAreaElement).value).toBe('Get-Process');
    nothingStarted();

    // Restoring history loads the script into the editor and does not execute it.
    element.querySelector<HTMLElement>('[data-testid="history-load"]')!.click();
    await settleFsJobs(fixture);
    expect((element.querySelector('[data-testid="script"]') as HTMLTextAreaElement).value).toBe('Remove-Item C:\\old');
    expect(element.querySelector('[data-testid="script-warnings"]')?.textContent).toContain('Remove-Item');
    expect(calls.previews).toEqual([]);
    nothingStarted();

    // Preview shows the exact script and digest but still starts nothing.
    element.querySelector<HTMLElement>('[data-testid="preview-run"]')!.click();
    await settleFsJobs(fixture);
    expect(calls.previews).toHaveLength(1);
    expect(element.querySelector('[data-testid="preview-script"]')!.textContent).toBe('Remove-Item C:\\old');
    expect(element.querySelector('[data-testid="preview-sha"]')!.textContent).toContain('a'.repeat(64));
    nothingStarted();

    // Editing after the preview invalidates it (discarded, confirm control gone).
    const editor = element.querySelector<HTMLTextAreaElement>('[data-testid="script"]')!;
    editor.value = 'Get-Date';
    editor.dispatchEvent(new Event('input'));
    await settleFsJobs(fixture);
    expect(calls.discards).toEqual(['preview-1']);
    expect(element.querySelector('[data-testid="run-confirm"]')).toBeNull();
    nothingStarted();

    // Fresh preview, then only the separate confirm click requests a token and runs, for exactly that preview.
    element.querySelector<HTMLElement>('[data-testid="preview-run"]')!.click();
    await settleFsJobs(fixture);
    element.querySelector<HTMLElement>('[data-testid="run-confirm"]')!.click();
    await settleFsJobs(fixture);
    expect(calls.confirms).toEqual(['preview-2']);
    expect(calls.runs).toEqual([{ previewId: 'preview-2', token: 'token-1' }]);

    emit({ runId: 'run-1', stream: 'stdout', text: 'hello' });
    emit({ runId: 'run-1', stream: 'complete', exitCode: 0 });
    await settleFsJobs(fixture);
    expect(element.querySelector('[data-testid="stdout"]')!.textContent).toContain('hello');
    expect(calls.runs).toHaveLength(1);
  });
});
