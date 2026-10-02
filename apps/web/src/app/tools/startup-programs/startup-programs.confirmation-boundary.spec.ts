import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import type { StartupProgramsResult } from "@dude/contracts/system/startup-types";
import { fakeElectronBridge } from '../../core/platform/testing/fake-electron-bridge';
import { installBridge, removeBridge, settleFsJobs } from '../../core/platform/testing/recording-fs-bridge';
import { fakeSysPlanPreview, recordingSysBridge } from '../../core/platform/testing/recording-sys-bridge';
import { StartupProgramsTool } from './startup-programs';

const result: StartupProgramsResult = { warnings: [], entries: [{
  id: 'run|hkcu|foo', source: 'registry-run', name: 'Foo', command: '"C:\\Apps\\foo.exe" --quiet', targetPath: 'C:\\Apps\\foo.exe',
  exists: true, publisher: 'Example Corp', signature: 'signed', state: 'enabled', scope: 'user',
  approved: { hive: 'HKCU', path: 'Software\\Microsoft\\Windows\\CurrentVersion\\Explorer\\StartupApproved\\Run', view: 'default', valueName: 'Foo', exists: true, bytes: '0200000000000000' },
}] };

describe('Startup Programs — confirmation boundary (DUDE_PRD.md §5.2.1)', () => {
  afterEach(() => { removeBridge(); localStorage.clear(); });

  it('plans the exact StartupApproved operation and applies only after separate review and confirmation', async () => {
    const preview = fakeSysPlanPreview({ title: 'Disable startup entry: Foo', tool: 'startup-programs', ops: [{
      index: 0, kind: 'startup.disable', target: 'HKCU\\…\\Foo', summary: 'Disable startup entry', before: 'enabled', after: 'disabled', warnings: [], requiresElevation: false, noUndo: false,
    }] });
    const { bridge, calls } = recordingSysBridge({ preview });
    const base = fakeElectronBridge();
    installBridge(fakeElectronBridge({ ...bridge, sys: { ...base.sys, startupList: async () => result } }));
    TestBed.configureTestingModule({ providers: [provideRouter([])] });
    const fixture = TestBed.createComponent(StartupProgramsTool);
    fixture.detectChanges();
    await settleFsJobs(fixture);
    const element = fixture.nativeElement as HTMLElement;
    const row = [...element.querySelectorAll<HTMLElement>('[role="row"]')].find((item) => item.textContent?.includes('Foo'))!;
    row.click();
    await settleFsJobs(fixture);
    element.querySelector<HTMLButtonElement>('[data-testid="startup-toggle-preview"]')!.click();
    await settleFsJobs(fixture);

    expect(calls.plans[0]).toEqual({ tool: 'startup-programs', title: 'Disable startup entry: Foo', ops: [{ kind: 'startup.disable', params: {
      hive: 'HKCU', path: 'Software\\Microsoft\\Windows\\CurrentVersion\\Explorer\\StartupApproved\\Run', view: 'default', valueName: 'Foo', exists: true, bytes: '0200000000000000', enabled: false,
    } }] });
    expect(calls.tokens).toEqual([]);
    expect(calls.applies).toEqual([]);

    element.querySelector<HTMLButtonElement>('[data-testid="system-change-review-apply"]')!.click();
    await settleFsJobs(fixture);
    expect(calls.applies).toEqual([]);
    element.querySelector<HTMLButtonElement>('[data-testid="system-change-confirm"]')!.click();
    await settleFsJobs(fixture);
    expect(calls.tokens).toHaveLength(1);
    expect(calls.applies).toHaveLength(1);
  });
});
