import { Component, inject } from '@angular/core';
import { PwaInstallService } from '../../../core/pwa/pwa-install.service';

/** Web install prompt. Only applicable while the browser offers installation (`showWhen`). */
@Component({
  selector: 'app-home-pwa-hint-panel',
  template: `
    <div class="flex flex-wrap items-center gap-2 rounded-sm border border-accent/40 bg-accent/5 px-3 py-1.5 text-ui text-text" role="status">
      <span class="flex-1">Install DUDE as an app for its own window, jump-list shortcuts, and "Open with DUDE" for files.</span>
      <button type="button" class="rounded-sm border border-accent px-2 py-0.5 text-ui-xs text-accent hover:bg-accent/10" (click)="pwa.install()">Install</button>
      <button type="button" class="rounded-sm border border-border px-2 py-0.5 text-ui-xs text-text-muted hover:bg-panel-elevated" (click)="pwa.hintDismissed.set(true)">
        Not now
      </button>
    </div>
  `,
})
export class HomePwaHintPanel {
  protected readonly pwa = inject(PwaInstallService);
}
