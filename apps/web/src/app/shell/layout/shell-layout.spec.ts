import { ApplicationRef } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { provideServiceWorker } from '@angular/service-worker';
import { OverlayContainer } from '@angular/cdk/overlay';
import { routes } from '../../core/routing/app.routes';
import { CommandPaletteService } from '../command-palette/command-palette.service';
import { TOOL_COMMAND_SOURCE_PROVIDERS } from '../../core/registry/tool-command-source';

describe('ShellLayout — global Ctrl+K listener', () => {
  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideRouter(routes), provideServiceWorker('ngsw-worker.js', { enabled: false }), ...TOOL_COMMAND_SOURCE_PROVIDERS],
    });
  });

  afterEach(() => {
    TestBed.inject(CommandPaletteService).close();
    TestBed.inject(OverlayContainer).ngOnDestroy();
  });

  async function stable(): Promise<void> {
    await TestBed.inject(ApplicationRef).whenStable();
  }

  function dispatchKeydown(init: KeyboardEventInit): void {
    window.dispatchEvent(new KeyboardEvent('keydown', init));
  }

  // The deck has its own always-present "Search tools…" input, so
  // presence of the CDK overlay backdrop (only rendered while the palette
  // overlay is attached) is the reliable signal that the palette is open.
  function isPaletteOpen(): boolean {
    return document.querySelector('.cdk-overlay-backdrop') !== null;
  }

  it('opens the command palette on Ctrl+K', async () => {
    await RouterTestingHarness.create('/');
    expect(isPaletteOpen()).toBe(false);

    dispatchKeydown({ key: 'k', ctrlKey: true });
    await stable();

    expect(isPaletteOpen()).toBe(true);
  });

  it('closes the command palette on a second Ctrl+K', async () => {
    await RouterTestingHarness.create('/');

    dispatchKeydown({ key: 'k', ctrlKey: true });
    await stable();
    expect(isPaletteOpen()).toBe(true);

    dispatchKeydown({ key: 'k', ctrlKey: true });
    await stable();

    expect(isPaletteOpen()).toBe(false);
  });

  it('does not open the command palette on a plain "k" without Ctrl', async () => {
    await RouterTestingHarness.create('/');

    dispatchKeydown({ key: 'k', ctrlKey: false });
    await stable();

    expect(isPaletteOpen()).toBe(false);
  });
});
