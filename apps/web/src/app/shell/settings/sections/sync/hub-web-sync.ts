import { Component, OnInit, computed, inject, signal } from '@angular/core';
import type { DeviceInfo, SyncDeviceSummary } from '@dude/contracts/hub';
import { SYNC_CATEGORIES, type SyncCategory } from '@dude/sync';
import { HUB_ADMIN } from '../../../../core/hub/hub-admin.token';
import { DESKTOP_RELEASES_URL, DesktopHandoffService } from '../../../../core/deep-link/desktop-handoff.service';
import { HUB_WEB_BOOT } from '../../../../core/hub-web/hub-web.types';
import { SyncStatusService } from '../../../../core/sync/sync-status.service';
import { hubErrorText } from '../hub/hub-format';

export interface DeviceSyncRow {
  readonly deviceId: string;
  readonly name: string;
  readonly kind: 'desktop' | 'browser';
  readonly self: boolean;
  readonly cursor: number;
  readonly lag: number;
  readonly pending: number;
  readonly conflicts: number;
  readonly quarantined: number;
  readonly paused: boolean;
  readonly lastPushAt: string | null;
  readonly lastPullAt: string | null;
}

const when = (iso: string | null): string => (iso ? new Date(iso).toLocaleString() : 'Never');

/**
 * Settings > Sync on the Hub-served web (PD-054): this browser's own state, the environment's Web access toggles, and the
 * per-device status table the Hub builds from what every device reports. The browser has no first sync, pause, quarantine
 * or standalone mode, and desktop conflicts are resolved on the owning desktop.
 */
@Component({
  selector: 'app-hub-web-sync',
  template: `
    <div class="flex flex-col gap-4" data-testid="hub-web-sync">
      <div data-setting class="flex flex-col gap-2" data-testid="sync-status" role="status">
        <h3 class="text-ui-sm font-semibold text-text">This browser</h3>
        @if (status(); as s) {
          <p class="text-ui" [class.text-text]="s.phase === 'idle' || s.phase === 'syncing'" [class.text-warning]="s.phase === 'offline'" [class.text-error]="s.phase === 'revoked' || s.phase === 'hub-outdated'" data-testid="phase-copy">
            @switch (s.phase) {
              @case ('idle') { Live. Shared changes reach your Hub as you make them and arrive here as they happen. }
              @case ('syncing') { Reading the latest changes from the Hub... }
              @case ('offline') { Hub unreachable — changes paused. Loaded tools keep working; shared edits are not saved until the Hub answers again. }
              @case ('revoked') { Your Hub session expired. Sign in again; nothing on this page was wiped. }
              @case ('hub-outdated') { This page and the Hub are out of date with each other. Reload to continue. }
              @default { Sync is not running. }
            }
          </p>
          <dl class="grid grid-cols-[max-content_1fr] gap-x-3 gap-y-1 text-ui">
            <dt class="text-text-muted">Last pull</dt>
            <dd class="text-text" data-testid="last-sync">{{ lastSync() }}</dd>
            <dt class="text-text-muted">Hub revision read</dt>
            <dd class="text-text" data-testid="cursor">{{ s.cursor }}{{ s.headRevision === null ? '' : ' of ' + s.headRevision }}</dd>
          </dl>
          <div class="flex flex-wrap gap-2">
            <button type="button" class="rounded-sm border border-accent px-2 py-0.5 text-ui text-accent hover:bg-accent/10 disabled:opacity-50" data-testid="sync-now" [disabled]="sync.busy() || s.phase === 'syncing'" (click)="syncNow()">Sync now</button>
          </div>
        } @else {
          <p class="text-ui text-text-muted" role="status">Checking sync...</p>
        }
        @if (sync.error(); as message) { <p class="text-ui text-error" role="alert" data-testid="sync-error">{{ message }}</p> }
      </div>

      <div data-setting class="flex flex-col gap-2" data-testid="categories">
        <h3 class="text-ui-sm font-semibold text-text">Web access</h3>
        <p class="text-ui-sm text-text-muted" data-testid="web-access-copy">
          These switches set what browsers may read and write on this Hub. They apply to every browser signed in to it, and not to desktops: each desktop keeps its own sync consent. Turning one off keeps that data in this browser only; the page reloads to pick up a change.
        </p>
        @for (c of categories; track c.id) {
          <div class="flex flex-col gap-0.5">
            <label class="flex items-center gap-2 text-ui text-text">
              <input type="checkbox" class="accent-accent" [attr.data-testid]="'toggle-' + c.id" [checked]="enabled(c.id)" [disabled]="sync.busy() || !live()" (change)="onToggle(c.id, $event)" />
              {{ c.label }}
              @if (c.sensitivity === 'sensitive') { <span class="rounded-sm border border-warning px-1 text-ui-sm text-warning">Sensitive</span> }
            </label>
            <p class="pl-6 text-ui-sm text-text-muted">{{ c.description }}</p>
          </div>
        }
      </div>

      <div data-setting class="flex flex-col gap-2" data-testid="device-table">
        <div class="flex items-center gap-3">
          <h3 class="text-ui-sm font-semibold text-text">Devices</h3>
          <button type="button" class="rounded-sm border border-border px-2 py-0.5 text-ui text-text-muted hover:bg-panel-elevated disabled:opacity-50" data-testid="devices-refresh" [disabled]="loading()" (click)="load()">Refresh</button>
        </div>
        @if (loadError(); as message) { <p class="text-ui text-error" role="alert" data-testid="devices-error">{{ message }}</p> }
        @if (rows().length === 0 && !loading() && !loadError()) { <p class="text-ui text-text-muted">No devices have reported yet.</p> }
        @if (rows().length > 0) {
          <div class="overflow-x-auto">
            <table class="w-full text-left text-ui">
              <thead class="text-ui-sm text-text-muted">
                <tr>
                  <th class="pr-3 font-normal">Device</th><th class="pr-3 font-normal">Kind</th><th class="pr-3 font-normal">Revision</th><th class="pr-3 font-normal">Lag</th>
                  <th class="pr-3 font-normal">Pending</th><th class="pr-3 font-normal">Conflicts</th><th class="pr-3 font-normal">Quarantined</th><th class="pr-3 font-normal">State</th>
                  <th class="pr-3 font-normal">Last push</th><th class="font-normal">Last pull</th>
                </tr>
              </thead>
              <tbody>
                @for (row of rows(); track row.deviceId) {
                  <tr class="align-top text-text" data-testid="device-row" [attr.data-kind]="row.kind">
                    <td class="py-1 pr-3">{{ row.name }}@if (row.self) { <span class="ml-1 text-ui-sm text-text-muted">(this browser)</span> }</td>
                    <td class="py-1 pr-3" data-testid="row-kind">{{ row.kind === 'desktop' ? 'Desktop' : 'Browser' }}</td>
                    <td class="py-1 pr-3">{{ row.cursor }}</td>
                    <td class="py-1 pr-3">{{ row.lag }}</td>
                    <td class="py-1 pr-3">{{ row.pending }}</td>
                    <td class="py-1 pr-3">{{ row.conflicts }}</td>
                    <td class="py-1 pr-3">{{ row.quarantined }}</td>
                    <td class="py-1 pr-3">{{ row.paused ? 'Paused' : 'Active' }}</td>
                    <td class="py-1 pr-3">{{ when(row.lastPushAt) }}</td>
                    <td class="py-1">{{ when(row.lastPullAt) }}</td>
                  </tr>
                  @if (row.kind === 'desktop' && (row.conflicts > 0 || row.quarantined > 0)) {
                    <tr data-testid="resolve-row">
                      <td colspan="10" class="pb-2 text-ui-sm text-warning">
                        Resolve in DUDE Desktop: {{ row.name }} holds {{ row.conflicts }} conflict{{ row.conflicts === 1 ? '' : 's' }} and {{ row.quarantined }} quarantined change{{ row.quarantined === 1 ? '' : 's' }} that only that desktop can resolve.
                        @if (handoff.enabled) {
                          <button type="button" class="ml-2 underline" data-testid="open-desktop" (click)="openDesktop()">Open in Desktop</button>
                        }
                      </td>
                    </tr>
                  }
                }
              </tbody>
            </table>
          </div>
        }
        @if (handoffResult() === 'not-detected') {
          <p class="text-ui-sm text-text-muted" role="status" data-testid="handoff-missing">
            DUDE Desktop did not open. Open it yourself and go to Settings &gt; Sync, or <a class="text-accent underline" [href]="releasesUrl" target="_blank" rel="noopener">get Desktop DUDE</a>.
          </p>
        }
      </div>
    </div>
  `,
})
export class HubWebSync implements OnInit {
  protected readonly sync = inject(SyncStatusService);
  private readonly admin = inject(HUB_ADMIN);
  private readonly boot = inject(HUB_WEB_BOOT);
  protected readonly handoff = inject(DesktopHandoffService);

  protected readonly status = this.sync.status;
  protected readonly categories = SYNC_CATEGORIES;
  protected readonly releasesUrl = DESKTOP_RELEASES_URL;
  protected readonly rows = signal<readonly DeviceSyncRow[]>([]);
  protected readonly loading = signal(false);
  protected readonly loadError = signal<string | null>(null);
  protected readonly handoffResult = signal<'opened' | 'not-detected' | null>(null);
  protected readonly live = computed(() => this.status()?.phase === 'idle' || this.status()?.phase === 'syncing');
  protected readonly lastSync = computed(() => when(this.status()?.lastSyncAt ?? null));
  protected readonly when = when;

  ngOnInit(): void {
    void this.load();
  }

  protected enabled(id: SyncCategory): boolean { return this.status()?.categories[id] === true; }

  protected onToggle(id: SyncCategory, event: Event): void {
    void this.sync.setCategory(id, (event.target as HTMLInputElement).checked);
  }

  protected async syncNow(): Promise<void> {
    await this.sync.syncNow();
    await this.load();
  }

  protected async openDesktop(): Promise<void> {
    this.handoffResult.set(await this.handoff.open({ action: 'open', target: 'settings', section: 'sync' }));
  }

  protected async load(): Promise<void> {
    this.loading.set(true);
    this.loadError.set(null);
    try {
      const [summary, devices] = await Promise.all([this.admin.syncSummary(), this.admin.listDevices()]);
      this.rows.set(buildRows(summary.devices, devices, this.boot?.deviceId ?? null));
    } catch (error) {
      this.loadError.set(hubErrorText(error, 'The device list could not be loaded.'));
    } finally {
      this.loading.set(false);
    }
  }
}

export function buildRows(summary: readonly SyncDeviceSummary[], devices: readonly Pick<DeviceInfo, 'deviceId' | 'displayName'>[], selfId: string | null): DeviceSyncRow[] {
  const names = new Map(devices.map((d) => [d.deviceId, d.displayName] as const));
  return summary
    .map((d) => ({
      deviceId: d.deviceId,
      name: names.get(d.deviceId) ?? `Device ${d.deviceId.slice(0, 8)}`,
      kind: d.kind,
      self: d.deviceId === selfId,
      cursor: d.cursor, lag: d.lag, pending: d.pending, conflicts: d.conflicts, quarantined: d.quarantined, paused: d.paused,
      lastPushAt: d.lastPushAt, lastPullAt: d.lastPullAt,
    }))
    .sort((a, b) => Number(b.self) - Number(a.self) || a.name.localeCompare(b.name));
}
