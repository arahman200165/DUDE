import { Component, computed, inject, signal } from '@angular/core';
import type { SyncConflictChoice, SyncConflictView } from '@dude/contracts';
import { diffJson, hasDifferences } from '@dude/sync';
import { SyncStatusService } from '../../../../core/sync/sync-status.service';

const KIND_LABEL: Record<SyncConflictView['kind'], string> = {
  'edit-edit': 'Edited on both',
  'edit-delete': 'Edited here, deleted on the Hub',
  'delete-edit': 'Deleted here, edited on the Hub',
  'first-sync': 'Differs from the Hub',
};

/** Conflict inbox: unresolved sync conflicts with a side-by-side JSON diff and Keep Hub / Keep mine / Keep both. */
@Component({
  selector: 'app-conflict-inbox',
  template: `
    <section class="flex flex-col gap-2" data-testid="conflicts" aria-labelledby="conflicts-title">
      <h3 id="conflicts-title" class="text-ui-sm font-semibold text-text">Conflicts</h3>
      @if (conflicts().length === 0) {
        <p class="text-ui text-text-muted" data-testid="no-conflicts">No conflicts. Items changed on two devices will appear here until you decide.</p>
      } @else {
        <ul class="flex flex-col divide-y divide-border rounded-sm border border-border">
          @for (c of conflicts(); track c.id) {
            <li>
              <button
                type="button"
                class="flex w-full flex-wrap items-baseline gap-x-3 px-2 py-1 text-left text-ui hover:bg-panel-elevated"
                [attr.aria-expanded]="selectedId() === c.id"
                [attr.data-testid]="'conflict-' + c.id"
                (click)="toggle(c.id)"
              >
                <span class="font-semibold text-text">{{ c.name ?? c.entityId }}</span>
                <span class="text-text-muted">{{ c.category ?? c.entityType }} · {{ kind(c) }} · {{ c.detectedAt }}</span>
              </button>
            </li>
          }
        </ul>
        @if (selected(); as c) {
          <div class="flex flex-col gap-2 rounded-sm border border-border p-2" data-testid="conflict-detail">
            @if (c.fields.length > 0) { <p class="text-ui text-text-muted">Changed on both sides: {{ c.fields.join(', ') }}</p> }
            <div class="grid grid-cols-2 gap-px overflow-auto rounded-sm border border-border bg-border font-mono text-ui-sm" role="table" aria-label="Local and Hub versions">
              <div class="bg-panel px-2 py-0.5 font-sans font-semibold text-text" role="columnheader">This device</div>
              <div class="bg-panel px-2 py-0.5 font-sans font-semibold text-text" role="columnheader">Hub</div>
              @for (row of rows(); track $index) {
                <pre class="m-0 whitespace-pre-wrap px-2" role="cell" [class]="cell(row.kind, 'left')">{{ row.left ?? '' }}</pre>
                <pre class="m-0 whitespace-pre-wrap px-2" role="cell" [class]="cell(row.kind, 'right')">{{ row.right ?? '' }}</pre>
              }
            </div>
            @if (!differs()) { <p class="text-ui text-text-muted">The two versions are identical.</p> }
            <div class="flex flex-wrap items-center gap-2">
              <button type="button" class="rounded-sm border border-accent px-2 py-0.5 text-ui text-accent hover:bg-accent/10 disabled:opacity-50" data-testid="keep-hub" [disabled]="busy()" (click)="resolve(c, 'hub')">Keep Hub</button>
              <button type="button" class="rounded-sm border border-accent px-2 py-0.5 text-ui text-accent hover:bg-accent/10 disabled:opacity-50" data-testid="keep-mine" [disabled]="busy()" (click)="resolve(c, 'mine')">Keep mine</button>
              @if (c.canKeepBoth) {
                <button type="button" class="rounded-sm border border-accent px-2 py-0.5 text-ui text-accent hover:bg-accent/10 disabled:opacity-50" data-testid="keep-both" [disabled]="busy()" (click)="resolve(c, 'both')">Keep both</button>
              }
            </div>
            @if (error(); as message) { <p class="text-ui text-error" role="alert" data-testid="conflict-error">{{ message }}</p> }
          </div>
        }
      }
    </section>
  `,
})
export class ConflictInbox {
  private readonly sync = inject(SyncStatusService);

  protected readonly conflicts = this.sync.conflicts;
  protected readonly selectedId = signal<number | null>(null);
  protected readonly busy = signal(false);
  protected readonly error = signal<string | null>(null);

  protected readonly selected = computed(() => this.conflicts().find((c) => c.id === this.selectedId()) ?? null);
  protected readonly rows = computed(() => {
    const c = this.selected();
    return c ? diffJson(c.localDeleted ? null : c.localPayload, c.remoteDeleted ? null : c.remotePayload) : [];
  });
  protected readonly differs = computed(() => hasDifferences(this.rows()));

  protected kind(c: SyncConflictView): string { return KIND_LABEL[c.kind]; }

  protected toggle(id: number): void {
    this.selectedId.update((current) => (current === id ? null : id));
    this.error.set(null);
  }

  protected cell(kind: 'same' | 'changed' | 'removed' | 'added', side: 'left' | 'right'): string {
    if (kind === 'same') return 'text-text';
    if (kind === 'changed') return side === 'left' ? 'bg-error/10 text-text' : 'bg-success/10 text-text';
    if (kind === 'removed') return side === 'left' ? 'bg-error/10 text-text' : 'text-text';
    return side === 'right' ? 'bg-success/10 text-text' : 'text-text';
  }

  protected async resolve(c: SyncConflictView, choice: SyncConflictChoice): Promise<void> {
    this.busy.set(true);
    this.error.set(null);
    try {
      const result = await this.sync.resolveConflict(c.id, choice);
      if (result.ok) this.selectedId.set(null);
      else this.error.set(result.error);
    } finally {
      this.busy.set(false);
    }
  }
}
