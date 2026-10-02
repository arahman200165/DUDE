import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { fakeElectronBridge } from '../../core/platform/testing/fake-electron-bridge';
import { installBridge, removeBridge, settleFsJobs } from '../../core/platform/testing/recording-fs-bridge';
import { recordingSysBridge } from '../../core/platform/testing/recording-sys-bridge';
import { WindowsFeaturesTool } from './windows-features';

describe('Windows Features confirmation boundary', () => {
  afterEach(() => { removeBridge(); });

  it('keeps listing read-only and applies a feature operation only after preview, review and confirm', async () => {
    const { bridge, calls } = recordingSysBridge();
    const base = fakeElectronBridge();
    installBridge({
      ...bridge,
      sys: {
        ...base.sys,
        pwshStatus: async () => ({ available: true, path: 'pwsh.exe', version: '7.6.0', source: 'path' }),
        featureList: async () => [{ name: 'NetFx3', displayName: '.NET Framework 3.5', state: 'disabled', restartNeeded: false }],
        featureCapabilities: async () => [{ name: 'Language.Basic~~~en-US~0.0.1.0', displayName: 'English basic typing', state: 'not-present' }],
      },
    } as unknown as typeof bridge);
    TestBed.configureTestingModule({ providers: [provideRouter([])] });
    const fixture = TestBed.createComponent(WindowsFeaturesTool);
    const element = fixture.nativeElement as HTMLElement;
    fixture.detectChanges();
    await settleFsJobs(fixture);
    expect(element.textContent).toContain('.NET Framework 3.5');
    expect(calls.plans).toEqual([]);
    expect(calls.tokens).toEqual([]);
    expect(calls.applies).toEqual([]);

    element.querySelector<HTMLElement>('[data-testid="feature-toggle-0"]')!.click();
    await settleFsJobs(fixture);
    expect(calls.plans[0].ops).toEqual([{ kind: 'feature.enable', params: { name: 'NetFx3' } }]);
    expect(calls.tokens).toEqual([]);
    expect(calls.applies).toEqual([]);

    const click = async (id: string) => { element.querySelector<HTMLElement>(`[data-testid="${id}"]`)!.click(); await settleFsJobs(fixture); };
    await click('system-change-review-apply');
    expect(calls.applies).toEqual([]);
    await click('system-change-confirm');
    expect(calls.tokens).toHaveLength(1);
    expect(calls.applies).toHaveLength(1);
  });
});
