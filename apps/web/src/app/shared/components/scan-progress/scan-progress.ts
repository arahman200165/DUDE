import { Component, computed, input } from '@angular/core';
import type { FsJobHandle } from '../../../core/platform/fs-job.service';
import { formatBytes } from "@dude/tool-engine/shared/fs/format-size";
import { StatusGlyph } from '../status-glyph/status-glyph';

/**
 * Live status of a Phase 29 fs job (Milestone 523): counts, bytes, throughput, the current path,
 * a Cancel button, and the access-denied/unreadable list — issues are reported, never fatal.
 */
@Component({
  selector: 'app-scan-progress',
  imports: [StatusGlyph],
  template: `
    @if (job(); as current) {
      <div class="flex flex-wrap items-center gap-3 text-ui text-text-muted" data-testid="scan-progress">
        @switch (current.status()) {
          @case ('starting') { <span>Starting…</span> }
          @case ('running') { <span class="inline-flex items-center gap-1 text-accent"><app-status-glyph kind="busy" />{{ current.progress()?.phase ?? 'Working' }}…</span> }
          @case ('done') { <span class="inline-flex items-center gap-1 text-success"><app-status-glyph kind="success" />Done</span> }
          @case ('cancelled') { <span class="inline-flex items-center gap-1 text-warning"><app-status-glyph kind="cancelled" />Cancelled</span> }
          @case ('error') { <span class="inline-flex items-center gap-1 text-error"><app-status-glyph kind="error" />Failed</span> }
        }
        @if (current.progress(); as progress) {
          <span>{{ progress.scanned.toLocaleString() }} item(s)</span>
          <span>{{ bytes(progress.bytes) }}@if (progress.total) { / {{ bytes(progress.total) }} }</span>
          @if (current.status() === 'running' && progress.current) { <span class="max-w-md truncate font-mono text-ui-xs" [title]="progress.current">{{ progress.current }}</span> }
        }
        @if (current.status() === 'running' || current.status() === 'starting') {
          <button type="button" class="rounded-sm border border-border px-2 py-0.5 text-text" (click)="current.cancel()">Cancel</button>
        }
        @if (current.status() === 'error' && current.error()) { <span role="alert" class="text-error">{{ current.error() }}</span> }
      </div>
      @if (current.issues().length) {
        <details class="mt-1 text-ui-xs text-warning">
          <summary class="cursor-pointer"><app-status-glyph class="mr-1 align-middle" kind="warning" />{{ current.issues().length }}{{ current.issues().length >= 500 ? '+' : '' }} path(s) could not be read (access denied, in use, or removed)</summary>
          <ul class="max-h-40 overflow-auto font-mono">
            @for (issue of current.issues(); track $index) { <li>{{ issue.code }} — {{ issue.path || '(root)' }}</li> }
          </ul>
        </details>
      }
    }
  `,
})
export class ScanProgress {
  readonly job = input<FsJobHandle<unknown> | null>(null);
  protected readonly bytes = formatBytes;
  protected readonly running = computed(() => this.job()?.status() === 'running');
}
