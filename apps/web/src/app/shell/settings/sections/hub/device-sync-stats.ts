import { Component, computed, input } from '@angular/core';
import type { SyncDeviceSummary } from '@dude/contracts/hub';
import { relativeTime } from './hub-format';

/**
 * One device's sync stats for the Devices list: last sync, lag and attention badges.
 * `stat` is undefined when the Hub has no sync state for the device; `loaded` is false until the summary arrived.
 */
@Component({
  selector: 'app-device-sync-stats',
  template: `
    @if (!loaded()) {
      <span class="text-text-muted" data-testid="sync-unknown">-</span>
    } @else if (lastSync() === null) {
      <span class="text-text-muted" data-testid="sync-never">Never synced</span>
    } @else {
      <span class="flex flex-wrap items-center gap-1">
        <span class="text-text" data-testid="sync-last">{{ lastText() }}</span>
        <span [class]="lagClass()" data-testid="sync-lag">{{ lagText() }}</span>
        @if (stat()!.quarantined > 0) {
          <span class="rounded-sm border border-error px-1 text-ui-sm text-error" data-testid="sync-quarantined">{{ stat()!.quarantined }} quarantined</span>
        }
        @if (stat()!.conflicts > 0) {
          <span class="rounded-sm border border-warning px-1 text-ui-sm text-warning" data-testid="sync-conflicts">{{ stat()!.conflicts }} conflicts</span>
        }
        @if (stat()!.pending > 0) {
          <span class="rounded-sm border border-border px-1 text-ui-sm text-text-muted" data-testid="sync-pending">{{ stat()!.pending }} pending</span>
        }
      </span>
    }
  `,
})
export class DeviceSyncStats {
  readonly stat = input<SyncDeviceSummary | undefined>(undefined);
  readonly loaded = input(true);
  readonly now = input(Date.now());

  protected readonly lastSync = computed<string | null>(() => {
    const s = this.stat();
    if (s === undefined) return null;
    const times = [s.lastPushAt, s.lastPullAt].filter((t): t is string => t !== null && !Number.isNaN(Date.parse(t)));
    if (times.length === 0) return null;
    return times.reduce((a, b) => (Date.parse(a) >= Date.parse(b) ? a : b));
  });
  protected readonly lastText = computed(() => `Synced ${relativeTime(this.lastSync(), this.now()).toLowerCase()}`);
  protected readonly lagText = computed(() => {
    const lag = this.stat()?.lag ?? 0;
    return lag > 0 ? `${lag} behind` : 'up to date';
  });
  protected readonly lagClass = computed(() => ((this.stat()?.lag ?? 0) > 0 ? 'text-warning' : 'text-text-muted'));
}
