import { ApplicationRef } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';
import { fakeElectronBridge } from '../platform/testing/fake-electron-bridge';
import { OnboardingService } from '../platform/onboarding.service';
import { ToolLauncherService } from '../registry/tool-launcher.service';
import { WorkspaceTemplateService } from '../workspace/workspace-template.service';
import { DeepLinkService } from './deep-link.service';

describe('DeepLinkService', () => {
  const originalDude = window.dude;
  afterEach(() => Object.defineProperty(window, 'dude', { value: originalDude, configurable: true }));

  it('resolves open links through owning services and never executes run links', async () => {
    let receive: (url: string) => void = () => {};
    const ready = vi.fn();
    Object.defineProperty(window, 'dude', {
      value: fakeElectronBridge({ deepLink: { ready, onItem: (callback) => { receive = callback; return () => {}; } } }),
      configurable: true,
    });
    const router = { url: '/', navigateByUrl: vi.fn().mockResolvedValue(true), navigate: vi.fn().mockResolvedValue(true) };
    TestBed.configureTestingModule({ providers: [{ provide: Router, useValue: router }] });
    const onboarding = TestBed.inject(OnboardingService);
    onboarding.initialized.set(true);
    onboarding.visible.set(false);
    const launcher = TestBed.inject(ToolLauncherService);
    const openTool = vi.spyOn(launcher, 'open');
    const templates = TestBed.inject(WorkspaceTemplateService);
    const apply = vi.spyOn(templates, 'apply');
    const service = TestBed.inject(DeepLinkService);
    expect(ready).toHaveBeenCalledOnce();

    receive('dude://open/tool/json');
    await TestBed.inject(ApplicationRef).whenStable();
    expect(openTool).toHaveBeenCalledWith(expect.objectContaining({ id: 'json' }));

    receive('dude://open/workspace-template/api-debugging');
    await TestBed.inject(ApplicationRef).whenStable();
    expect(apply).toHaveBeenCalledWith(expect.objectContaining({ id: 'api-debugging' }));
    expect(router.navigateByUrl).toHaveBeenCalledWith('/workspace');

    receive('dude://run/pipeline/unknown');
    await TestBed.inject(ApplicationRef).whenStable();
    expect(service.error()).toContain('not available');
    expect(router.navigate).not.toHaveBeenCalled();
  });
});
