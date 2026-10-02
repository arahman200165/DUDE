import { TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { CommandPaletteService } from '../../shell/command-palette/command-palette.service';
import { ToolLauncherService } from '../registry/tool-launcher.service';
import { fakeElectronBridge } from './testing/fake-electron-bridge';
import { NativeMenuService } from './native-menu.service';

describe('NativeMenuService', () => {
  const originalDude = window.dude;
  afterEach(() => Object.defineProperty(window, 'dude', { value: originalDude, configurable: true }));

  it('resolves menu actions and sends one registry snapshot after its debounce', async () => {
    let action: (id: string) => void = () => {};
    const ready = vi.fn();
    const setToolMenuData = vi.fn().mockResolvedValue({ ok: true });
    Object.defineProperty(window, 'dude', {
      value: fakeElectronBridge({ menu: { ready, onAction: (callback) => { action = callback; return () => {}; }, setToolMenuData } }),
      configurable: true,
    });
    TestBed.configureTestingModule({ providers: [provideRouter([])] });
    const launcher = TestBed.inject(ToolLauncherService);
    const openTool = vi.spyOn(launcher, 'open').mockImplementation(() => {});
    const palette = TestBed.inject(CommandPaletteService);
    const openPalette = vi.spyOn(palette, 'open').mockImplementation(() => {});
    const navigate = vi.spyOn(TestBed.inject(Router), 'navigateByUrl').mockResolvedValue(true);
    const service = TestBed.inject(NativeMenuService);
    service.refreshTools();
    await new Promise((resolve) => setTimeout(resolve, 150));
    expect(setToolMenuData).toHaveBeenCalledOnce();
    expect(setToolMenuData).toHaveBeenCalledWith(expect.arrayContaining([expect.objectContaining({ id: 'base64', category: 'encoding' })]));

    expect(ready).toHaveBeenCalledOnce();
    action('preferences');
    expect(navigate).toHaveBeenCalledWith('/settings');
    expect(openTool).not.toHaveBeenCalled();
    action('command-palette');
    expect(openPalette).toHaveBeenCalledOnce();
    action('tool:base64');
    expect(openTool).toHaveBeenCalledWith(expect.objectContaining({ id: 'base64' }));
    action('tool:missing');
    action('unrecognized');
    expect(openTool).toHaveBeenCalledTimes(1);
    expect(openPalette).toHaveBeenCalledOnce();
  });
});

