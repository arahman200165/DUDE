import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import type { DependencyNode } from "@dude/contracts/system/dependency-walker-types";
import { fakeElectronBridge } from '../../core/platform/testing/fake-electron-bridge';
import { installBridge, removeBridge } from '../../core/platform/testing/recording-fs-bridge';
import { DependencyWalkerTool } from './dependency-walker';

describe('DependencyWalkerTool', () => {
  afterEach(() => removeBridge());

  it('uses the native file picker and SystemInfoService, then renders forwarder-chain outcomes', async () => {
    const path = 'C:\\Apps\\sample.exe';
    const node: DependencyNode = {
      path, name: 'sample.exe', machine: 'x64', depth: 0,
      imports: [{ name: 'A.dll', delayLoad: true, status: 'resolved', path: 'C:\\Apps\\A.dll', missingSymbols: ['Run'], forwarderChains: [{ symbol: 'Run', chain: ['A.dll!Run', 'B.dll!Run'], status: 'missing-symbol', note: 'Target export is missing.' }] }],
    };
    const base = fakeElectronBridge();
    const picker = vi.fn(async () => ({ canceled: false as const, path, name: 'sample.exe', size: 10 }));
    const walker = vi.fn(async () => node);
    installBridge(fakeElectronBridge({ fs: { ...base.fs, pickFile: picker }, dependencyWalker: { walk: walker } }));
    TestBed.configureTestingModule({ providers: [provideRouter([])] });
    const fixture = TestBed.createComponent(DependencyWalkerTool);
    fixture.detectChanges();
    const button = [...(fixture.nativeElement as HTMLElement).querySelectorAll('button')].find((candidate) => candidate.textContent?.includes('Choose executable')) as HTMLButtonElement;
    expect(button.disabled).toBe(false);
    button.click();
    await fixture.whenStable();
    fixture.detectChanges();
    expect(picker).toHaveBeenCalledOnce();
    expect(walker).toHaveBeenCalledWith(path);
    expect((fixture.nativeElement as HTMLElement).textContent).toContain('Forwarder chain (missing-symbol)');
    expect((fixture.nativeElement as HTMLElement).textContent).toContain('Delay-load');
  });
});
