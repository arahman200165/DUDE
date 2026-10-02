import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import type { InstalledSoftware } from "@dude/contracts/system/software-types";
import { fakeElectronBridge } from '../../core/platform/testing/fake-electron-bridge';
import { installBridge, removeBridge, settleFsJobs } from '../../core/platform/testing/recording-fs-bridge';
import { fakeSysPlanPreview, recordingSysBridge } from '../../core/platform/testing/recording-sys-bridge';
import { InstalledSoftwareTool } from './installed-software';

const item: InstalledSoftware = {
  id: 'HKLM:64:Example.Product', name: 'Example Product', publisher: 'Example Inc.', installDate: null,
  estimatedSizeBytes: null, version: '1.0', source: 'registry-64', installLocation: null,
  uninstallCommand: 'C:\\Program Files\\Example\\uninstall.exe /quiet', uninstallable: true, productCode: null,
};

describe('Installed Software — confirmation boundary (DUDE_PRD.md §5.2.1)', () => {
  afterEach(() => { removeBridge(); localStorage.clear(); });

  it('listing and selecting are read-only; uninstall plans and applies only after no-undo acknowledgement', async () => {
    const preview = fakeSysPlanPreview({
      title: 'Uninstall Example Product',
      ops: [{ index: 0, kind: 'software.uninstall', target: 'Example Product', summary: 'Launch registered interactive uninstaller', before: 'Installed', after: 'Uninstaller launched', warnings: ['Interactive; cannot be undone'], requiresElevation: false, noUndo: true }],
      noUndo: true,
    });
    const { bridge, calls } = recordingSysBridge({ preview });
    const sys = { ...bridge.sys, listInstalledSoftware: async () => [item] };
    installBridge(fakeElectronBridge({ ...bridge, sys: sys as never }));
    TestBed.configureTestingModule({ providers: [provideRouter([])] });
    const fixture = TestBed.createComponent(InstalledSoftwareTool);
    const element = fixture.nativeElement as HTMLElement;
    fixture.detectChanges();
    await settleFsJobs(fixture);
    const click = async (id: string) => { element.querySelector<HTMLElement>(`[data-testid="${id}"]`)!.click(); await settleFsJobs(fixture); };

    expect(calls.plans).toEqual([]);
    expect(calls.applies).toEqual([]);
    await click('software-0');
    expect(calls.applies).toEqual([]);
    await click('uninstall-preview');
    expect(calls.plans).toHaveLength(1);
    expect(calls.plans[0].ops).toEqual([{
      kind: 'software.uninstall',
      params: { hive: 'HKLM', view: '64', keyName: 'Example.Product', displayName: 'Example Product', uninstallString: item.uninstallCommand },
    }]);
    expect(calls.tokens).toEqual([]);
    expect(calls.applies).toEqual([]);

    await click('system-change-review-apply');
    expect(calls.tokens).toEqual([]);
    expect(calls.applies).toEqual([]);
    const acknowledge = element.querySelector<HTMLInputElement>('[data-testid="system-change-accept-no-undo"]')!;
    acknowledge.click();
    await settleFsJobs(fixture);
    await click('system-change-confirm');
    expect(calls.tokens).toHaveLength(1);
    expect(calls.applies).toHaveLength(1);
    expect(calls.applies[0].acceptNoUndo).toBe(true);
  });
});
