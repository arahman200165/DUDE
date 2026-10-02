import { TestBed } from '@angular/core/testing';
import { DesktopUpdateService } from './desktop-update.service';
import type { PlatformBridge } from "@dude/contracts/shared/models/platform-bridge.model";
import { fakeElectronBridge } from './testing/fake-electron-bridge';

describe('DesktopUpdateService', () => {
  const originalDude = window.dude;

  afterEach(() => {
    Object.defineProperty(window, 'dude', { value: originalDude, configurable: true });
  });

  function withBridge(overrides: Partial<PlatformBridge>): DesktopUpdateService {
    Object.defineProperty(window, 'dude', { value: fakeElectronBridge(overrides), configurable: true });
    TestBed.configureTestingModule({});
    return TestBed.inject(DesktopUpdateService);
  }

  it('stays not-ready and no-ops on web', async () => {
    Object.defineProperty(window, 'dude', { value: undefined, configurable: true });
    TestBed.configureTestingModule({});
    const service = TestBed.inject(DesktopUpdateService);

    expect(service.updateReady()).toBe(false);
    await expect(service.restartAndInstall()).resolves.toBeUndefined();
  });

  it('flips updateReady when the bridge reports a downloaded update', () => {
    let fireDownloaded: (() => void) | undefined;
    const service = withBridge({
      update: {
        checkForUpdates: async () => ({ ok: true }),
        quitAndInstall: async () => ({ ok: true }),
        downloadUpdate: async () => ({ ok: true }),
        onUpdateAvailable: () => () => {},
        onUpdateDownloaded: (callback) => {
          fireDownloaded = () => callback({ version: '0.0.2' });
          return () => {};
        },
        onUpdateError: () => () => {},
      },
    });

    expect(service.updateReady()).toBe(false);
    fireDownloaded?.();
    expect(service.updateReady()).toBe(true);
  });

  it('calls through to quitAndInstall on desktop', async () => {
    let installed = false;
    const service = withBridge({
      update: {
        checkForUpdates: async () => ({ ok: true }),
        quitAndInstall: async () => {
          installed = true;
          return { ok: true };
        },
        downloadUpdate: async () => ({ ok: true }),
        onUpdateAvailable: () => () => {},
        onUpdateDownloaded: () => () => {},
        onUpdateError: () => () => {},
      },
    });

    await service.restartAndInstall();
    expect(installed).toBe(true);
  });
});
