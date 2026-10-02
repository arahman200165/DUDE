import { TestBed } from '@angular/core/testing';
import { PlatformService, isElectronRuntime } from './platform.service';
import { fakeElectronBridge } from './testing/fake-electron-bridge';
import { resolveHostKind } from './host-kind';
import { BUILD_HOST } from './host-flag';

describe('isElectronRuntime', () => {
  const originalDude = window.dude;

  afterEach(() => {
    Object.defineProperty(window, 'dude', { value: originalDude, configurable: true });
  });

  it('is false when no bridge is present', () => {
    Object.defineProperty(window, 'dude', { value: undefined, configurable: true });
    expect(isElectronRuntime()).toBe(false);
  });

  it('is true when the preload bridge reports desktop', () => {
    Object.defineProperty(window, 'dude', { value: fakeElectronBridge(), configurable: true });
    expect(isElectronRuntime()).toBe(true);
  });
});

describe('PlatformService', () => {
  const originalDude = window.dude;

  afterEach(() => {
    Object.defineProperty(window, 'dude', { value: originalDude, configurable: true });
  });

  it('reports desktop when constructed under the Electron bridge', () => {
    Object.defineProperty(window, 'dude', { value: fakeElectronBridge(), configurable: true });

    TestBed.configureTestingModule({});
    const service = TestBed.inject(PlatformService);

    expect(service.isDesktop()).toBe(true);
  });

  it('reports web when constructed without the Electron bridge', () => {
    Object.defineProperty(window, 'dude', { value: undefined, configurable: true });

    TestBed.configureTestingModule({});
    const service = TestBed.inject(PlatformService);

    expect(service.isDesktop()).toBe(false);
  });

  it('reports wasRestoredAfterCrash from the bridge on desktop, false on web', () => {
    Object.defineProperty(window, 'dude', { value: fakeElectronBridge({ platform: { isDesktop: true, wasRestoredAfterCrash: true } }), configurable: true });
    TestBed.configureTestingModule({});
    expect(TestBed.inject(PlatformService).wasRestoredAfterCrash).toBe(true);

    Object.defineProperty(window, 'dude', { value: undefined, configurable: true });
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({});
    expect(TestBed.inject(PlatformService).wasRestoredAfterCrash).toBe(false);
  });

  it('reports hostKind: desktop from the bridge, otherwise the build-time host flag', () => {
    Object.defineProperty(window, 'dude', { value: fakeElectronBridge(), configurable: true });
    TestBed.configureTestingModule({});
    expect(TestBed.inject(PlatformService).hostKind).toBe('desktop');

    Object.defineProperty(window, 'dude', { value: undefined, configurable: true });
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({});
    expect(TestBed.inject(PlatformService).hostKind).toBe(BUILD_HOST === 'hub' ? 'hub-web' : 'web-standalone');
  });
});

describe('resolveHostKind', () => {
  it('resolves every combination', () => {
    expect(resolveHostKind(true, 'web')).toBe('desktop');
    expect(resolveHostKind(true, 'hub')).toBe('desktop');
    expect(resolveHostKind(false, 'web')).toBe('web-standalone');
    expect(resolveHostKind(false, 'hub')).toBe('hub-web');
  });
});
