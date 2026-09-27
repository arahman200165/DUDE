import { ApplicationRef } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { vi } from 'vitest';
import { NATIVE_COMMAND_SOURCE_PROVIDERS, NativeCommandSource } from './native-command-source';
import { fakeElectronBridge } from './testing/fake-electron-bridge';
import { routes } from '../routing/app.routes';

async function stable(): Promise<void> {
  await TestBed.inject(ApplicationRef).whenStable();
}

describe('NativeCommandSource', () => {
  const originalDude = window.dude;

  afterEach(() => {
    Object.defineProperty(window, 'dude', { value: originalDude, configurable: true });
  });

  it('returns no commands on web', () => {
    Object.defineProperty(window, 'dude', { value: undefined, configurable: true });
    TestBed.configureTestingModule({ providers: [provideRouter(routes), ...NATIVE_COMMAND_SOURCE_PROVIDERS] });

    expect(TestBed.inject(NativeCommandSource).commands()).toEqual([]);
  });

  it('exposes the fixed native actions plus one command per quick action, on desktop', async () => {
    Object.defineProperty(window, 'dude', {
      value: fakeElectronBridge({
        quickActions: {
          list: async () => [{ id: 'copy-upper', label: 'Copy as Uppercase', hotkey: null }],
          run: async () => ({ ok: true }),
          setHotkey: async () => ({ ok: true }),
        },
      }),
      configurable: true,
    });
    TestBed.configureTestingModule({ providers: [provideRouter(routes), ...NATIVE_COMMAND_SOURCE_PROVIDERS] });
    const source = TestBed.inject(NativeCommandSource);
    await stable();

    const titles = source.commands().map((c) => c.title);
    expect(titles).toEqual(expect.arrayContaining(['Check for Updates', 'Open File…', 'Manage Secrets', 'Copy as Uppercase']));
    expect(source.commands().every((c) => c.kind === 'native')).toBe(true);
  });

  it('"Check for Updates" calls through to the update bridge', async () => {
    const checkForUpdates = vi.fn(async () => ({ ok: true as const }));
    Object.defineProperty(window, 'dude', {
      value: fakeElectronBridge({ update: { checkForUpdates, quitAndInstall: async () => ({ ok: true }), downloadUpdate: async () => ({ ok: true }), onUpdateAvailable: () => () => {}, onUpdateDownloaded: () => () => {}, onUpdateError: () => () => {} } }),
      configurable: true,
    });
    TestBed.configureTestingModule({ providers: [provideRouter(routes), ...NATIVE_COMMAND_SOURCE_PROVIDERS] });
    const source = TestBed.inject(NativeCommandSource);

    await source.commands().find((c) => c.id === 'native:check-updates')!.execute();

    expect(checkForUpdates).toHaveBeenCalled();
  });

  it('Manage Secrets opens the Settings AI / LLM Provider section', async () => {
    Object.defineProperty(window, 'dude', { value: fakeElectronBridge(), configurable: true });
    TestBed.configureTestingModule({ providers: [provideRouter(routes), ...NATIVE_COMMAND_SOURCE_PROVIDERS] });
    const navigate = vi.spyOn(TestBed.inject(Router), 'navigateByUrl').mockResolvedValue(true);

    await TestBed.inject(NativeCommandSource).commands().find((c) => c.id === 'native:manage-secrets')!.execute();

    expect(navigate).toHaveBeenCalledWith('/settings/ai');
  });
});
