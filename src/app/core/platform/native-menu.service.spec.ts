import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { CommandPaletteService } from '../../shell/command-palette/command-palette.service';
import { ToolLauncherService } from '../registry/tool-launcher.service';
import { fakeElectronBridge } from './testing/fake-electron-bridge';
import { NativeMenuService } from './native-menu.service';

describe('NativeMenuService', () => {
  const originalDude = window.dude;
  afterEach(() => Object.defineProperty(window, 'dude', { value: originalDude, configurable: true }));

  it('resolves Preferences from manifest metadata and opens the palette command', () => {
    let action: (id: string) => void = () => {};
    const ready = vi.fn();
    Object.defineProperty(window, 'dude', {
      value: fakeElectronBridge({ menu: { ready, onAction: (callback) => { action = callback; return () => {}; } } }),
      configurable: true,
    });
    TestBed.configureTestingModule({ providers: [provideRouter([])] });
    const launcher = TestBed.inject(ToolLauncherService);
    const openTool = vi.spyOn(launcher, 'open').mockImplementation(() => {});
    const palette = TestBed.inject(CommandPaletteService);
    const openPalette = vi.spyOn(palette, 'open').mockImplementation(() => {});
    TestBed.inject(NativeMenuService);

    expect(ready).toHaveBeenCalledOnce();
    action('preferences');
    expect(openTool).toHaveBeenCalledWith(expect.objectContaining({ id: 'settings' }));
    action('command-palette');
    expect(openPalette).toHaveBeenCalledOnce();
    action('unrecognized');
    expect(openTool).toHaveBeenCalledOnce();
    expect(openPalette).toHaveBeenCalledOnce();
  });
});

