import { TestBed } from '@angular/core/testing';
import { ShellChromeService } from './shell-chrome.service';
import type { DudeElectronBridge } from './electron-bridge';
import { fakeElectronBridge } from './testing/fake-electron-bridge';

describe('ShellChromeService', () => {
  const originalDude = window.dude;

  afterEach(() => {
    Object.defineProperty(window, 'dude', { value: originalDude, configurable: true });
  });

  function withBridge(overrides: Partial<DudeElectronBridge>): ShellChromeService {
    Object.defineProperty(window, 'dude', { value: fakeElectronBridge(overrides), configurable: true });
    TestBed.configureTestingModule({});
    return TestBed.inject(ShellChromeService);
  }

  it('returns web-safe defaults when no bridge is present', async () => {
    Object.defineProperty(window, 'dude', { value: undefined, configurable: true });
    TestBed.configureTestingModule({});
    const service = TestBed.inject(ShellChromeService);

    expect(await service.getLaunchOnLogin()).toBe(false);
    expect(await service.listQuickActions()).toEqual([]);
    expect(await service.setLaunchOnLogin(true)).toEqual({ ok: false, error: 'not-supported' });
    expect(await service.setQuickActionHotkey('x', 'Ctrl+Alt+B')).toEqual({ ok: false, error: 'not-supported' });
    expect(await service.notify('t', 'b')).toEqual({ ok: false, error: 'not-supported' });
  });

  it('passes through the quick-action list', async () => {
    const service = withBridge({
      quickActions: {
        list: async () => [{ id: 'uuid-generate-clipboard', label: 'Generate UUID to Clipboard', hotkey: null }],
        run: async () => ({ ok: true }),
        setHotkey: async () => ({ ok: true }),
      },
    });

    expect(await service.listQuickActions()).toEqual([{ id: 'uuid-generate-clipboard', label: 'Generate UUID to Clipboard', hotkey: null }]);
  });

  it('surfaces a hotkey registration failure', async () => {
    const service = withBridge({
      quickActions: { list: async () => [], run: async () => ({ ok: true }), setHotkey: async () => ({ ok: false, error: 'registration-failed' }) },
    });

    expect(await service.setQuickActionHotkey('uuid-generate-clipboard', 'Ctrl+Alt+U')).toEqual({ ok: false, error: 'registration-failed' });
  });

  it('passes through launch-on-login get/set', async () => {
    const calls: boolean[] = [];
    const service = withBridge({
      shell: {
        getLaunchOnLogin: async () => true,
        openDefaultApps: async () => ({ ok: true }),
        setLaunchOnLogin: async (enabled) => {
          calls.push(enabled);
          return { ok: true };
        },
      },
    });

    expect(await service.getLaunchOnLogin()).toBe(true);
    expect(await service.setLaunchOnLogin(false)).toEqual({ ok: true });
    expect(calls).toEqual([false]);
  });
});
