import { inject as injectPlatformBridge } from '@angular/core';
import { PLATFORM_BRIDGE } from '../../../core/platform/platform-bridge.adapter';
import { Component } from '@angular/core';

/**
 * Desktop "Open File…" picker trigger. Reuses the `--open-with-dude`/Explorer-association pipeline
 * (`DesktopOpenService` picks the resulting item off the same queue); this is only the trigger, and
 * it acts on click — never on mount.
 */
@Component({
  selector: 'app-home-open-file-panel',
  template: `
    <button
      type="button"
      (click)="openFile()"
      class="flex items-center gap-1.5 rounded-sm border border-border bg-panel px-2 py-1 text-xs text-text-muted hover:bg-panel-elevated hover:text-text"
    >
      Open File…
    </button>
  `,
})
export class HomeOpenFilePanel {
  private readonly platformBridgePort = injectPlatformBridge(PLATFORM_BRIDGE);

  protected openFile(): void {
    void this.platformBridgePort.get()!.open.pickFile();
  }
}
