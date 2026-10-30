import { Component, computed, effect, inject, signal } from '@angular/core';
import { HUB_JOB_IDS } from '@dude/contracts/hub';
import type { HubJobId, HubJobOutcome, HubJobStatus } from '@dude/contracts/hub';
import { HUB_ADMIN } from '../../../../core/hub/hub-admin.token';
import { refetchOnHubChange } from '../../../../core/hub-events/refetch-on-hub-change';
import { StatusGlyph, type StatusGlyphKind } from '../../../../shared/components/status-glyph/status-glyph';
import { hubErrorText, relativeTime, relativeUntil } from './hub-format';
import { HubOwnerSession } from './hub-owner-session.service';

export const HUB_JOB_NAMES: Readonly<Record<HubJobId, string>> = {
  'leaf-renewal': 'Certificate renewal (local CA)',
  'acme-renewal': 'Certificate renewal (public)',
  'backup-schedule': 'Scheduled backup',
  'restore-drill': 'Monthly restore drill',
  'sync-compaction': 'Sync history compaction',
  'address-watch': 'Address watch',
  'audit-prune': 'Audit log pruning',
  'collab-history-prune': 'Document history pruning',
  'collab-maintenance': 'Document storage maintenance',
  'queue-runner': 'Background work queue',
  'blobs-verify': 'Attachment integrity check',
  'blobs-staging-sweep': 'Abandoned upload cleanup',
  'uploads-expire': 'Expired upload cleanup',
};

interface OutcomeView {
  readonly label: string;
  readonly glyph: StatusGlyphKind;
  readonly tone: string;
}

const OUTCOME: Readonly<Record<HubJobOutcome, OutcomeView>> = {
  success: { label: 'Succeeded', glyph: 'success', tone: 'text-success' },
  skipped: { label: 'Skipped', glyph: 'idle', tone: 'text-text-muted' },
  failed: { label: 'Failed', glyph: 'error', tone: 'text-error' },
};

interface JobRow {
  readonly id: HubJobId;
  readonly name: string;
  readonly job: HubJobStatus | null;
}

/**
 * Environment & Hub: the Hub's background jobs and how each last ended (PD-112). Strictly read-only: it has no control that runs, queues
 * or changes a job, so nothing here needs a confirmation. Refetches quietly when the Hub reports the `jobs` view changed.
 */
@Component({
  selector: 'app-hub-jobs-panel',
  imports: [StatusGlyph],
  template: `
    <h3 class="text-ui-sm font-semibold text-text">Hub jobs</h3>
    <p class="text-ui text-text-muted">What the Hub runs in the background and how each job last ended. This list is view-only.</p>
    @if (error(); as message) {
      <p class="text-ui text-error" role="alert" data-testid="jobs-error">{{ message }}</p>
    } @else if (jobs() === null) {
      <p class="text-ui text-text-muted" role="status">Loading Hub jobs...</p>
    } @else {
      <div class="overflow-x-auto">
        <table class="w-full text-left text-ui" data-testid="hub-jobs">
          <thead class="text-ui-xs uppercase tracking-wide text-text-muted">
            <tr>
              <th scope="col" class="py-1 pr-3 font-normal">Job</th>
              <th scope="col" class="py-1 pr-3 font-normal">Last result</th>
              <th scope="col" class="py-1 pr-3 font-normal">Finished</th>
              <th scope="col" class="py-1 pr-3 font-normal">Next due</th>
              <th scope="col" class="py-1 font-normal">State</th>
            </tr>
          </thead>
          <tbody>
            @for (row of rows(); track row.id) {
              <tr class="border-t border-border align-top" [attr.data-testid]="'job-' + row.id">
                <th scope="row" class="py-1 pr-3 font-normal text-text">{{ row.name }}</th>
                @if (row.job; as job) {
                  <td class="py-1 pr-3">
                    @if (outcome(job); as o) {
                      <span class="inline-flex items-center gap-1" [class]="o.tone" data-testid="job-outcome"><app-status-glyph [kind]="o.glyph" />{{ o.label }}</span>
                      @if (job.lastSummary) {
                        <span class="block text-text-muted" data-testid="job-summary">{{ job.lastSummary }}</span>
                      }
                      @if (attempt(job); as a) {
                        <span class="block text-text-muted" data-testid="job-attempt">Last attempt: <span class="inline-flex items-center gap-1" [class]="a.view.tone"><app-status-glyph [kind]="a.view.glyph" />{{ a.view.label }}</span> {{ a.when }}@if (a.summary) { - {{ a.summary }}}</span>
                      }
                    } @else {
                      <span class="text-text-muted" data-testid="job-outcome">Not run yet</span>
                    }
                  </td>
                  <td class="py-1 pr-3 text-text-muted" data-testid="job-finished">{{ relative(job.lastFinishedAt) }}</td>
                  <td class="py-1 pr-3 text-text-muted" data-testid="job-next">{{ until(job.nextDueAt) }}</td>
                  <td class="py-1 text-text-muted" data-testid="job-running">
                    @if (job.running) {
                      <span class="inline-flex items-center gap-1 text-info"><app-status-glyph kind="busy" />Running</span>
                    } @else {
                      Idle
                    }
                  </td>
                } @else {
                  <td class="py-1 text-text-muted" colspan="4">The Hub did not report this job.</td>
                }
              </tr>
            }
          </tbody>
        </table>
      </div>
    }
  `,
})
export class HubJobsPanel {
  private readonly hub = inject(HUB_ADMIN);
  private readonly session = inject(HubOwnerSession);
  protected readonly jobs = signal<readonly HubJobStatus[] | null>(null);
  protected readonly error = signal<string | null>(null);
  protected readonly rows = computed<readonly JobRow[]>(() => {
    const byId = new Map((this.jobs() ?? []).map((job) => [job.id, job] as const));
    return HUB_JOB_IDS.map((id) => ({ id, name: HUB_JOB_NAMES[id], job: byId.get(id) ?? null }));
  });

  protected outcome(job: HubJobStatus): OutcomeView | null {
    return job.lastOutcome === null ? null : OUTCOME[job.lastOutcome];
  }
  /** A skipped last run hides the last real attempt (a failed backup, say); show it, and why it failed. Absent from an older Hub. */
  protected attempt(job: HubJobStatus): { view: OutcomeView; when: string; summary: string | null } | null {
    const a = job.lastAttempt;
    if (job.lastOutcome !== 'skipped' || a === undefined || a === null) return null;
    return { view: OUTCOME[a.outcome], when: relativeTime(a.finishedAt), summary: a.outcome === 'failed' && a.summary !== '' ? a.summary : null };
  }
  protected relative(iso: string | null): string { return relativeTime(iso); }
  protected until(iso: string | null): string { return relativeUntil(iso); }

  constructor() {
    effect(() => {
      if (this.session.signedIn()) void this.load();
    });
    // A job started or finished (PD-113): refetch once the first load has shown something.
    refetchOnHubChange('jobs', () => void this.load(), { when: () => this.session.signedIn() && this.jobs() !== null });
  }

  private async load(): Promise<void> {
    try {
      this.jobs.set((await this.hub.listJobs()).jobs);
      this.error.set(null);
    } catch (error) {
      this.error.set(hubErrorText(error, 'The Hub jobs could not be loaded.'));
    }
  }
}
