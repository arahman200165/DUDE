import { NgTemplateOutlet } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, effect, inject, signal, untracked } from '@angular/core';
import type { BackupStatusResponse, HubProvisioningResponse, HubTunnelStatusResponse } from '@dude/contracts/hub';
import { HUB_ADMIN } from '../../../../core/hub/hub-admin.token';
import { refetchOnHubChange } from '../../../../core/hub-events/refetch-on-hub-change';
import { Disclosure } from '../../../../shared/components/disclosure/disclosure';
import { StatusGlyph } from '../../../../shared/components/status-glyph/status-glyph';
import { hubErrorText } from './hub-format';
import { HubOwnerSession } from './hub-owner-session.service';
import { PLATFORM_CHIPS, buildPlatformGroups, countNeedingAttention, type PlatformChip, type PlatformChipView, type PlatformCommand, type PlatformGroup } from './hub-platform-status';

export const COPY_FAILED_TEXT = 'The clipboard is not available here. Select the command text and copy it yourself.';

/**
 * Environment & Hub > Platform (32-SS1, Milestone 852, decision 5): per-component status of the Hub platform (storage, queue and workers, tunnel, sign-in,
 * backups and destinations with their last restore drill, standby, power policy and the secrets to enter again) with the exact elevated `dude-hub` command
 * to copy for each state that needs the owner. Strictly read-only and unable to widen exposure: it holds no control that turns on the tunnel or Public
 * mode, grants a standby, changes the power plan, prunes or runs a backup, and the port has no method that could. A command is text; running it is a
 * separate, elevated, two-step act on the Hub machine. The port methods are optional and exist only on the Hub-web adapter, so on any other host the
 * panel renders nothing.
 */
@Component({
  selector: 'app-hub-platform-panel',
  imports: [Disclosure, NgTemplateOutlet, StatusGlyph],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (available) {
      <section class="flex flex-col gap-3" aria-labelledby="hub-platform-heading" data-testid="hub-platform">
        <div class="flex flex-wrap items-center gap-3">
          <div class="min-w-0 flex-1">
            <h3 id="hub-platform-heading" class="text-ui-sm font-semibold text-text">Platform</h3>
            <p class="text-ui text-text-muted" data-testid="platform-note">
              How each part of the Hub is doing. This list is view-only: turning on the tunnel, changing the power plan, granting a standby, backing up and pruning are elevated <code class="font-mono text-text">dude-hub</code> commands on the Hub machine, and can never be started from this page.
            </p>
          </div>
          <button type="button" class="rounded-sm border border-border px-2 py-0.5 text-ui text-text hover:bg-panel-elevated disabled:opacity-50" data-testid="platform-refresh" [disabled]="loading()" (click)="refresh()">Refresh</button>
        </div>

        <div aria-live="polite" class="text-ui text-text-muted" data-testid="platform-live">
          @if (loading() && groups() === null) {
            <p role="status" data-testid="platform-loading">Loading the platform status…</p>
          } @else if (error(); as message) {
            <p class="text-error" role="alert" data-testid="platform-error">{{ message }}</p>
          } @else if (groups() !== null) {
            <p data-testid="platform-summary">{{ summary() }}</p>
          }
          @if (copyNotice(); as notice) {
            <p [class]="notice.ok ? 'text-success' : 'text-error'" data-testid="copy-notice">{{ notice.text }}</p>
          }
        </div>

        @for (group of groups() ?? []; track group.id) {
          <section class="flex flex-col gap-1" [attr.aria-labelledby]="'platform-group-' + group.id" [attr.data-testid]="'platform-group-' + group.id">
            <h4 [id]="'platform-group-' + group.id" class="text-ui-xs font-semibold uppercase tracking-wide text-text-muted">{{ group.title }}</h4>
            <ul class="flex flex-col gap-2">
              @for (row of group.rows; track row.id) {
                <li class="flex flex-col gap-1 rounded-sm border border-border p-2" [attr.data-testid]="'platform-row-' + row.id" [attr.data-chip]="row.chip">
                  <div class="flex flex-wrap items-center gap-x-3 gap-y-1">
                    <span class="text-ui font-semibold text-text" data-testid="row-title">{{ row.title }}</span>
                    <span class="inline-flex items-center gap-1 text-ui font-semibold" [class]="chip(row.chip).tone" data-testid="row-chip"><app-status-glyph [kind]="chip(row.chip).glyph" />{{ chip(row.chip).label }}</span>
                  </div>
                  <p class="text-ui text-text-muted" data-testid="row-reason">{{ row.reason }}</p>
                  @if (row.next; as next) {
                    <p class="text-ui text-text" data-testid="row-next">{{ next }}</p>
                  }
                  @if (row.facts.length > 0) {
                    <dl class="grid grid-cols-[max-content_1fr] gap-x-3 gap-y-0.5 text-ui" data-testid="row-facts">
                      @for (fact of row.facts; track fact.label) {
                        <dt class="text-text-muted">{{ fact.label }}</dt>
                        <dd class="break-words text-text">{{ fact.value }}</dd>
                      }
                    </dl>
                  }
                  @if (row.guidanceLabel; as label) {
                    <app-disclosure [label]="label">
                      <ul class="flex list-disc flex-col gap-1 pl-4 text-ui text-text-muted" data-testid="row-guidance">
                        @for (line of row.guidance; track $index) { <li>{{ line }}</li> }
                      </ul>
                    </app-disclosure>
                  }
                  @for (destination of row.destinations; track destination.id) {
                    <div class="mt-1 flex flex-col gap-1 border-l border-border pl-3" [attr.data-testid]="'destination-' + destination.id" [attr.data-chip]="destination.chip">
                      <div class="flex flex-wrap items-center gap-x-3 gap-y-1">
                        <span class="text-ui font-semibold text-text">{{ destination.title }}</span>
                        <span class="inline-flex items-center gap-1 text-ui font-semibold" [class]="chip(destination.chip).tone" data-testid="destination-chip"><app-status-glyph [kind]="chip(destination.chip).glyph" />{{ chip(destination.chip).label }}</span>
                      </div>
                      <ul class="flex list-disc flex-col gap-0.5 pl-4 text-ui text-text-muted" data-testid="destination-lines">
                        @for (line of destination.lines; track $index) { <li>{{ line }}</li> }
                      </ul>
                      <ng-container [ngTemplateOutlet]="commandList" [ngTemplateOutletContext]="{ owner: row.id + '-' + destination.id, commands: destination.commands }" />
                    </div>
                  }
                  <ng-container [ngTemplateOutlet]="commandList" [ngTemplateOutletContext]="{ owner: row.id, commands: row.commands }" />
                </li>
              }
            </ul>
          </section>
        }

        <ng-template #commandList let-owner="owner" let-commands="commands">
          @if (commands.length > 0) {
            <ul class="flex flex-col gap-1" data-testid="row-commands">
              @for (item of commands; track item.id) {
                <li class="flex flex-col gap-0.5" [attr.data-testid]="'command-' + owner + '-' + item.id">
                  <span class="text-ui text-text">{{ item.label }}</span>
                  <div class="flex flex-wrap items-center gap-2">
                    <code class="select-all break-all rounded-sm border border-border bg-panel px-2 py-0.5 font-mono text-ui text-text" data-testid="command-text">{{ item.command }}</code>
                    <button type="button" class="rounded-sm border border-border px-2 py-0.5 text-ui text-text-muted hover:bg-panel-elevated" data-testid="command-copy" [attr.aria-label]="'Copy command: ' + item.label" (click)="copy(owner, item)">
                      {{ copiedKey() === owner + ':' + item.id ? 'Copied!' : 'Copy' }}
                    </button>
                  </div>
                  @if (item.note) { <p class="text-ui-sm text-text-muted" data-testid="command-note">{{ item.note }}</p> }
                </li>
              }
            </ul>
          }
        </ng-template>
      </section>
    }
  `,
})
export class HubPlatformPanel {
  private readonly hub = inject(HUB_ADMIN);
  private readonly session = inject(HubOwnerSession);

  /** Only the Hub-web adapter implements the read methods; elsewhere there is nothing to show and nothing is requested. */
  protected readonly available = typeof this.hub.provisioningStatus === 'function';

  protected readonly groups = signal<readonly PlatformGroup[] | null>(null);
  protected readonly loading = signal(false);
  protected readonly error = signal<string | null>(null);
  protected readonly copiedKey = signal<string | null>(null);
  protected readonly copyNotice = signal<{ readonly ok: boolean; readonly text: string } | null>(null);
  private readonly updatedAt = signal<number | null>(null);

  protected readonly summary = computed(() => {
    const groups = this.groups();
    if (groups === null) return '';
    const n = countNeedingAttention(groups);
    const when = this.updatedAt() === null ? '' : ` Updated ${new Date(this.updatedAt()!).toLocaleTimeString()}.`;
    return `${n === 0 ? 'Nothing needs your attention.' : n === 1 ? '1 item needs your attention.' : `${n} items need your attention.`}${when}`;
  });

  private copiedTimer: ReturnType<typeof setTimeout> | null = null;

  constructor() {
    effect(() => {
      if (this.available && this.session.signedIn()) untracked(() => void this.load());
      else this.groups.set(null);
    });
    // Backup health changed, a job ran or the diagnostics changed (PD-113): refetch quietly once something is shown.
    refetchOnHubChange(['backup', 'jobs', 'diagnostics'], () => void this.load(true), { when: () => this.available && this.session.signedIn() && this.groups() !== null });
  }

  protected chip(kind: PlatformChip): PlatformChipView {
    return PLATFORM_CHIPS[kind];
  }

  protected refresh(): void {
    if (this.session.signedIn()) void this.load();
  }

  /** Copies the command text exactly as shown. A refused clipboard is said out loud (the command stays selectable). */
  protected async copy(owner: string, command: PlatformCommand): Promise<void> {
    if (this.copiedTimer !== null) clearTimeout(this.copiedTimer);
    this.copiedTimer = null;
    try {
      await navigator.clipboard.writeText(command.command);
    } catch {
      this.copiedKey.set(null);
      this.copyNotice.set({ ok: false, text: COPY_FAILED_TEXT });
      return;
    }
    this.copiedKey.set(`${owner}:${command.id}`);
    this.copyNotice.set({ ok: true, text: `Copied: ${command.label}.` });
    this.copiedTimer = setTimeout(() => {
      this.copiedKey.set(null);
      this.copyNotice.set(null);
      this.copiedTimer = null;
    }, 1500);
  }

  private async load(quiet = false): Promise<void> {
    if (!quiet) this.loading.set(true);
    const hub = this.hub;
    // Each read is independent: a Hub that answers the backup status but not the tunnel still shows what it can, and says what it could not read.
    const [provisioning, tunnel, backup] = await Promise.allSettled([
      hub.provisioningStatus!(),
      hub.tunnelStatus ? hub.tunnelStatus() : Promise.reject(new Error('unsupported')),
      hub.backupStatus(),
    ]);
    try {
      for (const result of [provisioning, tunnel, backup]) {
        if (result.status === 'rejected' && this.session.noteError(result.reason, { unauthorizedMeansExpired: true })) return;
      }
      const value = <T>(r: PromiseSettledResult<T>): T | null => (r.status === 'fulfilled' ? r.value : null);
      const sources = { provisioning: value<HubProvisioningResponse>(provisioning), tunnel: value<HubTunnelStatusResponse>(tunnel), backup: value<BackupStatusResponse>(backup) };
      if (sources.provisioning === null && sources.tunnel === null && sources.backup === null) {
        const first = [provisioning, tunnel, backup].find((r): r is PromiseRejectedResult => r.status === 'rejected');
        this.error.set(hubErrorText(first?.reason, 'The platform status could not be loaded.'));
        return;
      }
      this.groups.set(buildPlatformGroups(sources));
      this.updatedAt.set(Date.now());
      this.error.set(null);
    } finally {
      this.loading.set(false);
    }
  }
}
