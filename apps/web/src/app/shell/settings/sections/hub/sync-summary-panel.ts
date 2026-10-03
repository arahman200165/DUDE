import { Component, computed, effect, inject, signal } from '@angular/core';
import type { SyncSummary } from '@dude/contracts/hub';
import { SYNC_CATEGORIES } from '@dude/sync';
import { HUB_ADMIN } from '../../../../core/hub/hub-admin.token';
import { hubErrorText } from './hub-format';
import { HubOwnerSession } from './hub-owner-session.service';

/** Environment & Hub: how many synchronized records the Hub holds per category. Counts only, no record browsing. */
@Component({
  selector: 'app-sync-summary-panel',
  template: `
    <h3 class="text-ui-sm font-semibold text-text">Synchronized records</h3>
    @if (error(); as message) {
      <p class="text-ui text-error" role="alert" data-testid="sync-summary-error">{{ message }}</p>
    } @else if (summary(); as s) {
      <dl class="grid grid-cols-[max-content_1fr] items-center gap-x-3 gap-y-1 text-ui" data-testid="sync-summary">
        @for (row of rows(); track row.id) {
          <dt class="text-text-muted">{{ row.label }}</dt>
          <dd class="text-text" [attr.data-testid]="'sync-count-' + row.id">{{ row.count }}</dd>
        }
        <dt class="text-text-muted">Head revision</dt>
        <dd class="text-text" data-testid="sync-head">{{ s.headRevision }}</dd>
        <dt class="text-text-muted">Retention</dt>
        <dd class="text-text" data-testid="sync-retention">{{ s.retentionDays }} days</dd>
        <dt class="text-text-muted">Compaction floor</dt>
        <dd class="text-text" data-testid="sync-floor">{{ s.floor }}</dd>
      </dl>
    } @else {
      <p class="text-ui text-text-muted" role="status">Loading sync summary…</p>
    }
  `,
})
export class SyncSummaryPanel {
  private readonly hub = inject(HUB_ADMIN);
  private readonly session = inject(HubOwnerSession);
  protected readonly summary = signal<SyncSummary | null>(null);
  protected readonly error = signal<string | null>(null);
  protected readonly rows = computed(() => {
    const counts = this.summary()?.counts;
    return SYNC_CATEGORIES.map((c) => ({ id: c.id, label: c.label, count: counts?.[c.id] ?? 0 }));
  });

  constructor() {
    effect(() => {
      if (this.session.signedIn()) void this.load();
    });
  }

  private async load(): Promise<void> {
    try {
      this.summary.set(await this.hub.syncSummary());
      this.error.set(null);
    } catch (error) {
      this.error.set(hubErrorText(error, 'The sync summary could not be loaded.'));
    }
  }
}
