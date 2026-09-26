import { TestBed } from '@angular/core/testing';
import { Subject } from 'rxjs';
import { PlatformService } from './platform.service';
import { CommandPaletteService } from '../../shell/command-palette/command-palette.service';
import { fakeElectronBridge } from './testing/fake-electron-bridge';
import { QuickLauncherService } from './quick-launcher.service';

describe('QuickLauncherService', () => {
  const originalDude = window.dude;
  afterEach(() => Object.defineProperty(window, 'dude', { value: originalDude, configurable: true }));

  it('shows the reused palette and dismisses only compact windows on close', async () => {
    let open: (event: { compact: boolean }) => void = () => {};
    let dismissed: () => void = () => {};
    const ready = vi.fn();
    const dismiss = vi.fn().mockResolvedValue({ ok: true });
    const promote = vi.fn().mockResolvedValue({ ok: true });
    Object.defineProperty(window, 'dude', {
      value: fakeElectronBridge({ quickLauncher: {
        ready,
        onOpen: (callback) => { open = callback; return () => {}; },
        onDismissed: (callback) => { dismissed = callback; return () => {}; },
        dismiss, promote,
        getHotkey: async () => 'Control+Alt+Space',
        setHotkey: async () => ({ ok: true }),
      } }),
      configurable: true,
    });
    const closed = new Subject<'dismiss' | 'execute'>();
    const palette = { open: vi.fn(), close: vi.fn(), closed };
    TestBed.configureTestingModule({ providers: [
      { provide: PlatformService, useValue: { isDesktop: () => true } },
      { provide: CommandPaletteService, useValue: palette },
    ] });
    const service = TestBed.inject(QuickLauncherService);
    expect(ready).toHaveBeenCalledOnce();
    expect(await service.getHotkey()).toBe('Control+Alt+Space');

    open({ compact: true });
    expect(service.compact()).toBe(true);
    expect(palette.open).toHaveBeenCalledOnce();
    closed.next('dismiss');
    expect(service.compact()).toBe(false);
    expect(dismiss).toHaveBeenCalledOnce();

    open({ compact: false });
    closed.next('dismiss');
    expect(dismiss).toHaveBeenCalledOnce();

    open({ compact: true });
    closed.next('execute');
    expect(promote).toHaveBeenCalledOnce();

    open({ compact: true });
    dismissed();
    expect(service.compact()).toBe(false);
    expect(palette.close).toHaveBeenCalledOnce();
  });
});

