import { Component, computed, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { describeSync, type SyncIndicatorKind } from '@dude/sync';
import { SyncStatusService } from '../../core/sync/sync-status.service';

const DOT: Record<SyncIndicatorKind, string> = {
  synced: 'bg-success',
  syncing: 'bg-accent motion-safe:animate-pulse',
  pending: 'bg-accent',
  offline: 'bg-offline',
  paused: 'bg-text-muted',
  conflicts: 'bg-warning',
  'needs-first-sync': 'bg-warning',
  revoked: 'bg-error',
  attention: 'bg-error',
};

/**
 * Compact desktop-only sync status, mounted once by `ShellLayout` (shell exception #13). Renders nothing on web and
 * on a standalone device; once enrolled it shows one prioritized state and links to Settings > Sync. The label is
 * always text (the dot is decoration), and the only motion is a pulse that reduced-motion users do not get.
 */
@Component({
  selector: 'app-sync-indicator',
  imports: [RouterLink],
  template: `
    @if (display(); as d) {
      <a
        routerLink="/settings/sync"
        class="inline-flex items-center gap-1.5 rounded px-1.5 py-0.5 font-mono text-ui-xs uppercase tracking-wide text-text-muted hover:bg-panel-elevated"
        data-testid="sync-indicator"
        [attr.data-state]="d.kind"
        [attr.aria-label]="'Sync: ' + d.label + '. ' + d.detail"
        [title]="d.detail"
      >
        <span class="h-1.5 w-1.5 rounded-full" [class]="dot()" aria-hidden="true"></span>
        {{ d.label }}
      </a>
    }
  `,
})
export class SyncIndicator {
  private readonly sync = inject(SyncStatusService);

  protected readonly display = computed(() => (this.sync.available ? describeSync(this.sync.status()) : null));
  protected readonly dot = computed(() => DOT[this.display()?.kind ?? 'synced']);
}
