import { Component, computed, inject, signal } from '@angular/core';
import type { QuarantinePreview, ResetApplyError, ResetKind, ResetPreview } from '@dude/contracts';
import { validateDisplayName } from '@dude/persistence';
import { DeviceAgentService } from '../../../core/device/device-agent.service';
import { DeviceIdentityService } from '../../../core/device/device-identity.service';
import { DeviceResetService } from '../../../core/device/device-reset.service';
import { DeviceStoreHealthService } from '../../../core/device/device-store-health.service';
import { OutboxStatusService } from '../../../core/persistence/entities/outbox-status.service';
import { CopyButton } from '../../../shared/components/copy-button/copy-button';
import { Disclosure } from '../../../shared/components/disclosure/disclosure';

const KIND_LABEL: Record<ResetKind, string> = { 'clear-data': 'Clear data', 'reset-device': 'Reset this device' };

const COUNT_LABEL: Record<string, string> = {
  kv: 'saved settings and tool state', records: 'saved items', outbox: 'pending sync operations', history_entries: 'History entries',
  network_runs: 'saved network runs', mutation_journal: 'change journal entries', snapshot_headers: 'snapshots',
  powershell_history: 'PowerShell history entries', device_docs: 'desktop preference documents', secret_refs: 'stored secrets',
  secret_values: 'secret values',
};

const ERROR_TEXT: Record<ResetApplyError | 'not-needed', string> = {
  'invalid-token': 'The confirmation was not valid. Start again.',
  expired: 'The confirmation expired. Start again.',
  'stale-preview': 'Your data changed after the preview. Review it again.',
  forbidden: 'This window cannot do that.',
  unavailable: 'The device store is not available right now.',
  failed: 'That did not complete. Nothing further was changed.',
  'not-needed': 'The store is working, so nothing needs recovering.',
};

type Pending =
  | { readonly type: 'reset'; readonly preview: ResetPreview }
  | { readonly type: 'quarantine'; readonly preview: QuarantinePreview };

/**
 * Settings > This Device. Identity, store health and recovery, plus the two destructive actions.
 * Destructive-Action Contract: opening the page and clicking a danger button only ever PREVIEWS;
 * the inline confirmation panel is the second, deliberate step, and Cancel discards the preview.
 */
@Component({
  selector: 'app-this-device-settings',
  imports: [CopyButton, Disclosure],
  templateUrl: './this-device-settings.html',
})
export class ThisDeviceSettings {
  private readonly identityService = inject(DeviceIdentityService);
  private readonly health = inject(DeviceStoreHealthService);
  private readonly outboxStatus = inject(OutboxStatusService);
  private readonly resets = inject(DeviceResetService);
  private readonly agent = inject(DeviceAgentService);

  protected readonly identity = this.identityService.identity;
  protected readonly isDesktopStore = this.health.isDesktopStore;
  protected readonly storeStatus = this.health.status;
  protected readonly storeHealth = this.health.health;
  protected readonly retrying = this.health.retrying;
  protected readonly outbox = this.outboxStatus.status;
  protected readonly storeReady = computed(() => !this.isDesktopStore || this.storeStatus() === 'ready');
  protected readonly canRetry = computed(() => this.isDesktopStore && (this.storeStatus() === 'unavailable' || this.storeStatus() === 'degraded'));
  protected readonly canQuarantine = computed(() => this.isDesktopStore && (this.storeStatus() === 'incompatible' || this.storeStatus() === 'corrupt'));

  protected readonly agentAvailable = this.agent.available;
  protected readonly agentStatus = this.agent.status;
  protected readonly agentBusy = this.agent.busy;
  protected readonly agentError = this.agent.error;
  protected readonly agentState = computed(() => {
    const status = this.agentStatus();
    if (!status) return 'Checking…';
    if (status.running) return 'Running';
    return status.stoppedByUser ? 'Stopped' : 'Not running';
  });
  protected readonly autostartDev = computed(() => this.agentStatus()?.autostart === 'unsupported-in-dev');
  protected readonly autostartSupported = computed(() => { const a = this.agentStatus()?.autostart; return a === 'enabled' || a === 'disabled'; });
  protected readonly autostartOn = computed(() => this.agentStatus()?.autostart === 'enabled');

  protected readonly nameDraft = signal<string | null>(null);
  protected readonly nameError = signal<string | null>(null);
  protected readonly nameSaved = signal(false);
  protected readonly nameValue = computed(() => this.nameDraft() ?? this.identity()?.displayName ?? '');

  protected readonly pending = signal<Pending | null>(null);
  protected readonly busy = signal(false);
  protected readonly message = signal<string | null>(null);

  protected readonly resetPreview = computed(() => { const p = this.pending(); return p?.type === 'reset' ? p.preview : null; });
  protected readonly quarantinePreview = computed(() => { const p = this.pending(); return p?.type === 'quarantine' ? p.preview : null; });

  protected readonly sizeText = computed(() => {
    const bytes = this.storeHealth()?.sizeBytes ?? 0;
    return bytes >= 1_048_576 ? `${(bytes / 1_048_576).toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`;
  });

  constructor() {
    if (this.isDesktopStore) void this.agent.refresh();
  }

  protected onAutostartToggle(event: Event): void { void this.agent.setAutostart((event.target as HTMLInputElement).checked); }
  protected stopAgent(): void { void this.agent.stop(); }
  protected startAgent(): void { void this.agent.start(); }

  protected kindLabel(kind: ResetKind): string { return KIND_LABEL[kind]; }

  protected countRows(counts: Record<string, number>): Array<{ label: string; count: number }> {
    return Object.entries(counts).filter(([, count]) => count > 0).map(([key, count]) => ({ label: COUNT_LABEL[key] ?? key, count }));
  }

  protected onNameInput(event: Event): void {
    this.nameDraft.set((event.target as HTMLInputElement).value);
    this.nameSaved.set(false);
    const checked = validateDisplayName(this.nameDraft());
    this.nameError.set(checked.ok ? null : checked.error);
  }

  protected async saveName(): Promise<void> {
    const draft = this.nameDraft();
    if (draft === null) return;
    const result = await this.identityService.rename(draft);
    if (!result.ok) { this.nameError.set(result.error); return; }
    this.nameDraft.set(null);
    this.nameError.set(null);
    this.nameSaved.set(true);
  }

  protected retry(): void { void this.health.retry(); }

  protected async openFolder(): Promise<void> {
    const result = await this.resets.openFolder();
    this.message.set(result.ok ? null : 'Could not open the store folder.');
  }

  /** Step one: fetch a preview. Never changes data. */
  protected async startReset(kind: ResetKind): Promise<void> {
    this.message.set(null);
    this.busy.set(true);
    try {
      const result = await this.resets.preview(kind);
      if (result.ok) this.pending.set({ type: 'reset', preview: result });
      else this.message.set(ERROR_TEXT[result.error]);
    } finally {
      this.busy.set(false);
    }
  }

  protected async startQuarantine(): Promise<void> {
    this.message.set(null);
    this.busy.set(true);
    try {
      const result = await this.resets.quarantinePreview();
      if (result.ok) this.pending.set({ type: 'quarantine', preview: result });
      else this.message.set(ERROR_TEXT[result.error]);
    } finally {
      this.busy.set(false);
    }
  }

  protected cancel(): void { this.pending.set(null); }

  /** Step two: the explicit confirm. Uses only the token its own preview returned. */
  protected async confirm(): Promise<void> {
    const current = this.pending();
    if (!current || this.busy()) return;
    this.pending.set(null);
    this.busy.set(true);
    try {
      const result = current.type === 'reset'
        ? await this.resets.apply({ kind: current.preview.kind, token: current.preview.token })
        : await this.resets.quarantineApply(current.preview.token);
      this.message.set(result.ok ? (current.type === 'reset' ? `${KIND_LABEL[current.preview.kind]} done.` : 'The store was moved aside and a fresh one started.') : ERROR_TEXT[result.error]);
      if (result.ok) this.nameDraft.set(null);
    } finally {
      this.busy.set(false);
    }
  }
}
