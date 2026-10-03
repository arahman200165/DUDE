import { Component, inject, signal } from '@angular/core';
import type { QuarantinedOpView } from '@dude/contracts';
import type { ConfirmPreview } from '@dude/contracts/hub';
import { SYNC_PORT, type SyncPort } from '../../../../core/sync/sync.port';
import { SyncStatusService } from '../../../../core/sync/sync-status.service';
import { downloadFile } from '../../../../shared/utils/download-file';

const REASONS: Record<string, string> = {
  'unknown-entity': 'The Hub does not recognize this kind of item.',
  'non-syncable-scope': 'This setting is not shared between devices.',
  'invalid-payload': 'The Hub could not read this item.',
  'too-large': 'The item is too large to sync.',
  'unknown-setting': 'The Hub does not recognize this setting.',
  'not-owner-device': 'Only the device that owns this item can change it.',
  'schema-too-new': 'This item was written by a newer version of DUDE than the Hub understands.',
};

/** Changes the Hub rejected. Retry, Discard (two-step: preview, then confirm) or Export JSON. */
@Component({
  selector: 'app-quarantine-list',
  template: `
    <section class="flex flex-col gap-2" data-testid="quarantine" aria-labelledby="quarantine-title">
      <h3 id="quarantine-title" class="text-ui-sm font-semibold text-text">Rejected changes</h3>
      @if (items().length === 0) {
        <p class="text-ui text-text-muted" data-testid="no-quarantine">The Hub has not rejected any changes.</p>
      } @else {
        <p class="text-ui text-text-muted">These changes stay on this device and are not sent again until you retry them.</p>
        <div class="flex flex-wrap gap-2">
          <button type="button" class="rounded-sm border border-accent px-2 py-0.5 text-ui text-accent hover:bg-accent/10 disabled:opacity-50" data-testid="retry-all" [disabled]="sync.busy()" (click)="sync.retryQuarantined()">Retry all</button>
          <button type="button" class="rounded-sm border border-border px-2 py-0.5 text-ui text-text-muted hover:bg-panel-elevated" data-testid="export" (click)="exportJson()">Export JSON</button>
        </div>
        <ul class="flex flex-col divide-y divide-border rounded-sm border border-border">
          @for (op of items(); track op.opId) {
            <li class="flex flex-col gap-1 px-2 py-1" [attr.data-testid]="'op-' + op.opId">
              <div class="flex flex-wrap items-baseline gap-x-3 text-ui">
                <span class="font-semibold text-text">{{ op.entityType }} {{ op.entityId }}</span>
                <span class="text-text-muted">{{ op.opKind }} · {{ reason(op) }} · {{ op.attempts }} attempt{{ op.attempts === 1 ? '' : 's' }}</span>
              </div>
              @if (pending()?.opId === op.opId) {
                <div class="flex flex-col gap-1 rounded-sm border border-warning p-2" role="alertdialog" [attr.aria-label]="'Confirm discard'" data-testid="discard-confirm">
                  <p class="text-ui text-text">Discard this change? It is removed from this device's outbox and will never reach the Hub. The item itself is not deleted.</p>
                  <div class="flex gap-2">
                    <button type="button" class="rounded-sm border border-error px-2 py-0.5 text-ui text-error disabled:opacity-50" data-testid="discard-apply" [disabled]="busy()" (click)="discard(op)">Discard change</button>
                    <button type="button" class="rounded-sm border border-border px-2 py-0.5 text-ui text-text-muted hover:bg-panel-elevated" (click)="pending.set(null)">Cancel</button>
                  </div>
                </div>
              } @else {
                <div class="flex gap-2">
                  <button type="button" class="rounded-sm border border-accent px-2 py-0.5 text-ui text-accent hover:bg-accent/10 disabled:opacity-50" data-testid="retry" [disabled]="sync.busy()" (click)="sync.retryQuarantined([op.opId])">Retry</button>
                  <button type="button" class="rounded-sm border border-border px-2 py-0.5 text-ui text-text-muted hover:bg-panel-elevated disabled:opacity-50" data-testid="discard" [disabled]="busy()" (click)="preview(op)">Discard</button>
                </div>
              }
            </li>
          }
        </ul>
      }
      @if (error(); as message) { <p class="text-ui text-error" role="alert" data-testid="quarantine-error">{{ message }}</p> }
    </section>
  `,
})
export class QuarantineList {
  private readonly port = inject(SYNC_PORT);
  protected readonly sync = inject(SyncStatusService);

  protected readonly items = this.sync.quarantined;
  protected readonly pending = signal<{ readonly opId: string; readonly token: ConfirmPreview } | null>(null);
  protected readonly busy = signal(false);
  protected readonly error = signal<string | null>(null);

  protected reason(op: QuarantinedOpView): string { return REASONS[op.reason ?? ''] ?? op.reason ?? 'Rejected by the Hub.'; }

  /** Step one: nothing is removed. */
  protected async preview(op: QuarantinedOpView): Promise<void> {
    await this.run(async (port) => this.pending.set({ opId: op.opId, token: await port.discardQuarantinedPreview(op.opId) }));
  }

  protected async discard(op: QuarantinedOpView): Promise<void> {
    const pending = this.pending();
    if (pending === null || pending.opId !== op.opId) return;
    await this.run(async (port) => {
      await port.discardQuarantined(op.opId, pending.token.confirmToken);
      this.pending.set(null);
      await this.sync.reload();
    });
  }

  protected async exportJson(): Promise<void> {
    await this.run(async (port) => {
      const ops = await port.exportQuarantined();
      downloadFile(new Blob([JSON.stringify(ops, null, 2)], { type: 'application/json' }), 'dude-rejected-changes.json', 'application/json');
    });
  }

  private async run(work: (port: SyncPort) => Promise<void>): Promise<void> {
    const port = this.port;
    if (port === null) return;
    this.busy.set(true);
    this.error.set(null);
    try { await work(port); } catch (error) { this.error.set(error instanceof Error ? error.message : 'That did not complete.'); } finally { this.busy.set(false); }
  }
}
