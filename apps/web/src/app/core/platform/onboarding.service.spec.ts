import { ApplicationRef } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { fakeElectronBridge } from './testing/fake-electron-bridge';
import { OnboardingService } from './onboarding.service';

describe('OnboardingService', () => {
  const originalDude = window.dude;
  beforeEach(() => localStorage.clear());
  afterEach(() => {
    Object.defineProperty(window, 'dude', { value: originalDude, configurable: true });
    localStorage.clear();
  });

  function desktop(): OnboardingService {
    Object.defineProperty(window, 'dude', { value: fakeElectronBridge(), configurable: true });
    return TestBed.inject(OnboardingService);
  }

  it('shows on first desktop launch and persists completion under __onboarding__', async () => {
    const service = desktop();
    await service.initialize();
    expect(service.visible()).toBe(true);
    service.setStep(3);
    service.complete();
    await TestBed.inject(ApplicationRef).whenStable();
    expect(localStorage.getItem('dude:v1:__onboarding__:completed')).toBe('true');
    expect(service.visible()).toBe(false);
  });

  it('ignores the old raw desktop keys (no legacy migration)', async () => {
    localStorage.setItem('dude:v1:desktop:onboarding-completed', 'true');
    const service = desktop();
    await service.initialize();
    expect(service.visible()).toBe(true);
  });

  it('stays hidden once completed under the __onboarding__ keys', async () => {
    localStorage.setItem('dude:v1:__onboarding__:completed', 'true');
    const service = desktop();
    await service.initialize();
    expect(service.visible()).toBe(false);
  });
});
