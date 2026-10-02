import { TestBed } from '@angular/core/testing';
import { SmartPasteHotkeyService } from './smart-paste-hotkey.service';
import type { PlatformBridge } from "@dude/contracts/shared/models/platform-bridge.model";
import { fakeElectronBridge } from './testing/fake-electron-bridge';

describe('SmartPasteHotkeyService', () => {
  const originalDude = window.dude;

  afterEach(() => {
    Object.defineProperty(window, 'dude', { value: originalDude, configurable: true });
  });

  function withBridge(overrides: Partial<PlatformBridge>): SmartPasteHotkeyService {
    Object.defineProperty(window, 'dude', { value: fakeElectronBridge(overrides), configurable: true });
    TestBed.configureTestingModule({});
    return TestBed.inject(SmartPasteHotkeyService);
  }

  it('returns web-safe defaults when no bridge is present', async () => {
    Object.defineProperty(window, 'dude', { value: undefined, configurable: true });
    TestBed.configureTestingModule({});
    const service = TestBed.inject(SmartPasteHotkeyService);

    expect(await service.getHotkey()).toBeNull();
    expect(await service.setHotkey('Ctrl+Alt+V')).toEqual({ ok: false, error: 'not-supported' });
  });

  it('passes through the current hotkey binding', async () => {
    const service = withBridge({
      smartPaste: { ready: () => {}, onTrigger: () => () => {}, getHotkey: async () => 'Ctrl+Alt+V', setHotkey: async () => ({ ok: true }) },
    });

    expect(await service.getHotkey()).toBe('Ctrl+Alt+V');
  });

  it('surfaces a hotkey registration failure', async () => {
    const service = withBridge({
      smartPaste: {
        ready: () => {},
        onTrigger: () => () => {},
        getHotkey: async () => null,
        setHotkey: async () => ({ ok: false, error: 'registration-failed' }),
      },
    });

    expect(await service.setHotkey('Ctrl+Alt+V')).toEqual({ ok: false, error: 'registration-failed' });
  });
});
