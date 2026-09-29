import { TestBed } from '@angular/core/testing';
import { Subject } from 'rxjs';
import { SwUpdate, VersionEvent } from '@angular/service-worker';
import { UpdateBadge } from './update-badge';
import type { DudeElectronBridge } from '../../../core/platform/electron-bridge';
import { fakeElectronBridge } from '../../../core/platform/testing/fake-electron-bridge';

class FakeSwUpdate {
  readonly versionUpdates = new Subject<VersionEvent>();
  isEnabled = true;
  activateUpdate = vi.fn().mockResolvedValue(true);
  checkForUpdate = vi.fn().mockResolvedValue(false);
}

describe('UpdateBadge', () => {
  const originalDude = window.dude;

  afterEach(() => {
    Object.defineProperty(window, 'dude', { value: originalDude, configurable: true });
  });

  it('shows the web "Reload" action on a ready SwUpdate version', () => {
    Object.defineProperty(window, 'dude', { value: undefined, configurable: true });
    const fakeSwUpdate = new FakeSwUpdate();
    TestBed.configureTestingModule({ providers: [{ provide: SwUpdate, useValue: fakeSwUpdate }] });

    const fixture = TestBed.createComponent(UpdateBadge);
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent.trim()).toBe('');

    fakeSwUpdate.versionUpdates.next({ type: 'VERSION_READY' } as VersionEvent);
    fixture.detectChanges();

    expect(fixture.nativeElement.textContent).toContain('Reload');

    fixture.nativeElement.querySelector('button').click();
    expect(fakeSwUpdate.activateUpdate).toHaveBeenCalled();
  });

  it('pairs the update text with an aria-hidden info glyph', () => {
    Object.defineProperty(window, 'dude', { value: undefined, configurable: true });
    const fakeSwUpdate = new FakeSwUpdate();
    TestBed.configureTestingModule({ providers: [{ provide: SwUpdate, useValue: fakeSwUpdate }] });
    const fixture = TestBed.createComponent(UpdateBadge);
    fixture.detectChanges();
    fakeSwUpdate.versionUpdates.next({ type: 'VERSION_READY' } as VersionEvent);
    fixture.detectChanges();

    const glyph = fixture.nativeElement.querySelector('app-status-glyph');
    expect(glyph.getAttribute('data-glyph')).toBe('info');
    expect(glyph.querySelector('svg').getAttribute('aria-hidden')).toBe('true');
    expect(fixture.nativeElement.textContent).toContain('Update available');
  });

  it('shows the desktop "Restart & Install" action once an update downloads', async () => {
    let fireDownloaded: (() => void) | undefined;
    let installed = false;
    const overrides: Partial<DudeElectronBridge> = {
      update: {
        checkForUpdates: async () => ({ ok: true }),
        quitAndInstall: async () => {
          installed = true;
          return { ok: true };
        },
        downloadUpdate: async () => ({ ok: true }),
        onUpdateAvailable: () => () => {},
        onUpdateDownloaded: (callback) => {
          fireDownloaded = () => callback({ version: '0.0.2' });
          return () => {};
        },
        onUpdateError: () => () => {},
      },
    };
    Object.defineProperty(window, 'dude', { value: fakeElectronBridge(overrides), configurable: true });
    TestBed.configureTestingModule({ providers: [{ provide: SwUpdate, useValue: new FakeSwUpdate() }] });

    const fixture = TestBed.createComponent(UpdateBadge);
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent.trim()).toBe('');

    fireDownloaded?.();
    fixture.detectChanges();

    expect(fixture.nativeElement.textContent).toContain('Restart & Install');

    fixture.nativeElement.querySelector('button').click();
    await Promise.resolve();
    expect(installed).toBe(true);
  });
});
