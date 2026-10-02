import { TestBed } from '@angular/core/testing';
import { FileWatchService } from './file-watch.service';
import type { PlatformBridge, FileWatchEvent } from "@dude/contracts/shared/models/platform-bridge.model";
import { fakeElectronBridge } from './testing/fake-electron-bridge';

describe('FileWatchService', () => {
  const originalDude = window.dude;

  afterEach(() => {
    Object.defineProperty(window, 'dude', { value: originalDude, configurable: true });
  });

  function withBridge(overrides: Partial<PlatformBridge>): FileWatchService {
    Object.defineProperty(window, 'dude', { value: fakeElectronBridge(overrides), configurable: true });
    TestBed.configureTestingModule({});
    return TestBed.inject(FileWatchService);
  }

  it('throws on web instead of touching window.dude', async () => {
    Object.defineProperty(window, 'dude', { value: undefined, configurable: true });
    TestBed.configureTestingModule({});
    const service = TestBed.inject(FileWatchService);

    await expect(service.watch('/repo', 'a.txt')).rejects.toThrow(/desktop app/);
    expect(service.onEvent(() => {})).toBeInstanceOf(Function);
  });

  it('returns a watchId on success', async () => {
    const service = withBridge({ fileWatch: { watch: async () => ({ ok: true, watchId: 'watch-42' }), unwatch: async () => ({ ok: true }), onEvent: () => () => {} } });
    expect(await service.watch('/repo', 'a.txt')).toBe('watch-42');
  });

  it('throws when the watch call fails', async () => {
    const service = withBridge({
      fileWatch: { watch: async () => ({ ok: false, error: 'not-granted' }), unwatch: async () => ({ ok: true }), onEvent: () => () => {} },
    });
    await expect(service.watch('/repo', 'a.txt')).rejects.toThrow(/not-granted/);
  });

  it('forwards events through onEvent and returns the unsubscribe function', () => {
    const events: FileWatchEvent[] = [];
    let unsubscribed = false;
    const service = withBridge({
      fileWatch: {
        watch: async () => ({ ok: true, watchId: 'watch-1' }),
        unwatch: async () => ({ ok: true }),
        onEvent: (callback) => {
          callback({ id: 'watch-1', kind: 'changed' });
          return () => {
            unsubscribed = true;
          };
        },
      },
    });

    const unsubscribe = service.onEvent((event) => events.push(event));
    expect(events).toEqual([{ id: 'watch-1', kind: 'changed' }]);
    unsubscribe();
    expect(unsubscribed).toBe(true);
  });
});
