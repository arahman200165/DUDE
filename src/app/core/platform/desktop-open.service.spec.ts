import { ApplicationRef } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { DesktopOpenService } from './desktop-open.service';
import { OnboardingService } from './onboarding.service';
import { NativeRecentsService } from '../native-recents/native-recents.service';
import { fakeElectronBridge } from './testing/fake-electron-bridge';
import { routes } from '../routing/app.routes';
import type { DesktopOpenItem } from './electron-bridge';

async function stable(): Promise<void> {
  await TestBed.inject(ApplicationRef).whenStable();
}

describe('DesktopOpenService', () => {
  const originalDude = window.dude;

  afterEach(() => {
    Object.defineProperty(window, 'dude', { value: originalDude, configurable: true });
  });

  function withBridge(): { service: DesktopOpenService; deliver: (item: DesktopOpenItem) => void } {
    let deliver: ((item: DesktopOpenItem) => void) | undefined;
    Object.defineProperty(window, 'dude', {
      value: fakeElectronBridge({
        open: {
          ready: () => {},
          pickFile: async () => ({ canceled: true }),
          getPathForFile: () => '',
          enqueuePath: async () => ({ ok: true }),
          reopen: async () => ({ ok: true }),
          onItem: (callback) => {
            deliver = callback;
            return () => {};
          },
        },
      }),
      configurable: true,
    });
    localStorage.clear();
    sessionStorage.clear();
    TestBed.configureTestingModule({ providers: [provideRouter(routes)] });
    const service = TestBed.inject(DesktopOpenService);
    TestBed.inject(OnboardingService).initialized.set(true);
    return { service, deliver: deliver! };
  }

  it('records a successfully-opened file into NativeRecentsService', async () => {
    const { deliver } = withBridge();
    const nativeRecents = TestBed.inject(NativeRecentsService);

    deliver({ kind: 'file', path: 'C:/notes.md', name: 'notes.md', extension: '.md', text: '# hi' });
    await stable();

    expect(nativeRecents.entries().map((e) => e.path)).toEqual(['C:/notes.md']);
  });

  it('does not record a directory open', async () => {
    const { deliver } = withBridge();
    const nativeRecents = TestBed.inject(NativeRecentsService);

    deliver({ kind: 'directory', path: 'C:/project', name: 'project' });
    await stable();

    expect(nativeRecents.entries()).toEqual([]);
  });

  it('does not record a failed open', async () => {
    const { deliver } = withBridge();
    const nativeRecents = TestBed.inject(NativeRecentsService);

    deliver({ kind: 'error', path: 'C:/bad.exe', message: 'unsupported' });
    await stable();

    expect(nativeRecents.entries()).toEqual([]);
  });

  it('reopen() calls through to the bridge on desktop and no-ops on web', async () => {
    const { service } = withBridge();
    const reopenSpy = vi.spyOn(window.dude!.open, 'reopen');

    expect(await service.reopen('C:/notes.md')).toEqual({ ok: true });
    expect(reopenSpy).toHaveBeenCalledWith('C:/notes.md');

    Object.defineProperty(window, 'dude', { value: undefined, configurable: true });
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({ providers: [provideRouter(routes)] });
    const webService = TestBed.inject(DesktopOpenService);
    expect(await webService.reopen('C:/notes.md')).toEqual({ ok: false, error: 'not-supported' });
  });
});
