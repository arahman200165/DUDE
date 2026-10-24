import { Component, inject } from '@angular/core';
import { PresenceService } from '../../../../core/presence/presence.service';

/**
 * Environment & Hub > "Share the tool I'm using with my Hub" (PD-108). Off by default and device-local (`__device__:presenceShareActivity`,
 * never synced). Shown only where a presence port exists: the desktop app and the Hub-served web page.
 */
@Component({
  selector: 'app-presence-sharing-panel',
  template: `
    @if (presence.available) {
      <div data-setting class="flex flex-col gap-1" data-testid="presence-sharing">
        <label class="flex items-start gap-2 text-ui text-text">
          <input type="checkbox" class="mt-0.5 accent-accent" data-testid="presence-share-toggle" [checked]="presence.shareActivity()" (change)="onToggle($event)" />
          <span>Share the tool I'm using with my Hub</span>
        </label>
        <p class="pl-6 text-ui text-text-muted" data-testid="presence-share-hint">
          Only the tool or page name is shared, and only while this is on. It is kept in memory on your Hub, shown to your own signed-in sessions, and never synced or audited.
        </p>
      </div>
    }
  `,
})
export class PresenceSharingPanel {
  protected readonly presence = inject(PresenceService);

  protected onToggle(event: Event): void {
    this.presence.shareActivity.set((event.target as HTMLInputElement).checked);
  }
}
