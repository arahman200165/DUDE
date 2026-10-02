import { TestBed } from '@angular/core/testing';
import { CollabService } from './collab.service';
import type { PlatformBridge } from "@dude/contracts/shared/models/platform-bridge.model";
import { fakeElectronBridge } from './testing/fake-electron-bridge';

describe('CollabService', () => {
  const originalDude = window.dude;

  afterEach(() => {
    Object.defineProperty(window, 'dude', { value: originalDude, configurable: true });
  });

  function withBridge(overrides: Partial<PlatformBridge>): CollabService {
    Object.defineProperty(window, 'dude', { value: fakeElectronBridge(overrides), configurable: true });
    TestBed.configureTestingModule({});
    return TestBed.inject(CollabService);
  }

  it('returns web-safe defaults when no bridge is present', async () => {
    Object.defineProperty(window, 'dude', { value: undefined, configurable: true });
    TestBed.configureTestingModule({});
    const service = TestBed.inject(CollabService);

    expect(await service.startSession()).toEqual({ ok: false, error: 'not-supported' });
    expect(await service.participantCount()).toBe(0);
    await expect(service.stopSession()).resolves.toBeUndefined();
  });

  it('passes through a successful session start', async () => {
    const service = withBridge({
      collab: {
        startSession: async () => ({ ok: true, url: 'ws://192.168.1.5:5555', sessionCode: 'feedbe' }),
        stopSession: async () => ({ ok: true }),
        participantCount: async () => 2,
      },
    });

    expect(await service.startSession()).toEqual({ ok: true, url: 'ws://192.168.1.5:5555', sessionCode: 'feedbe' });
    expect(await service.participantCount()).toBe(2);
  });
});
