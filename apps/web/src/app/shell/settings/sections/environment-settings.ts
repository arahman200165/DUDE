import { Component, DestroyRef, ElementRef, computed, effect, inject, signal, viewChild } from '@angular/core';
import { RouterLink } from '@angular/router';
import { PAIRING_STRING_PREFIX, parsePairingString } from '@dude/contracts/hub';
import { HUB_ADMIN } from '../../../core/hub/hub-admin.token';
import { HubAdminError, type HubStatus } from '../../../core/hub/hub-admin.port';
import { PlatformService } from '../../../core/platform/platform.service';
import { CopyButton } from '../../../shared/components/copy-button/copy-button';
import { connectionKind, groupFingerprint, hubErrorText, relativeTime, shortId, HUB_CONNECTION_COPY } from './hub/hub-format';
import { HubOwnerSession } from './hub/hub-owner-session.service';
import { HubStatusBadge } from './hub/hub-status-badge';
import { HubWebActionsPanel } from './hub/hub-web-actions-panel';
import { LocalHubPanel } from './hub/local-hub-panel';
import { OwnerGate } from './hub/owner-gate';
import { SyncSummaryPanel } from './hub/sync-summary-panel';
import { OwnerRecoveryPanel } from './hub/owner-recovery-panel';

type DisconnectStep = 'idle' | 'confirm' | 'unreachable' | 'force-confirm';

/**
 * Settings > Environment & Hub. Desktop: connection status, connect (pairing string) and disconnect.
 * Hub-served web: what this Hub is, its TLS pin and the owner session.
 * Destructive-Action Contract: Disconnect first only explains; the Confirm button is the second, deliberate
 * step, and a local-only disconnect needs its own confirmation.
 */
@Component({
  selector: 'app-environment-settings',
  imports: [CopyButton, HubStatusBadge, HubWebActionsPanel, LocalHubPanel, OwnerGate, OwnerRecoveryPanel, RouterLink, SyncSummaryPanel],
  templateUrl: './environment-settings.html',
})
export class EnvironmentSettings {
  private readonly hub = inject(HUB_ADMIN);
  protected readonly session = inject(HubOwnerSession);
  protected readonly isHubWeb = inject(PlatformService).hostKind === 'hub-web';

  protected readonly status = signal<HubStatus | null>(null);
  protected readonly loadError = signal<string | null>(null);
  protected readonly tls = signal<{ readonly spkiSha256: string; readonly nextSpkiSha256: string | null } | null>(null);

  protected readonly kind = computed(() => {
    const status = this.status();
    return status === null ? null : connectionKind(status);
  });
  protected readonly stateDetail = computed(() => {
    const kind = this.kind();
    return kind === null ? '' : HUB_CONNECTION_COPY[kind].detail;
  });
  protected readonly lastContact = computed(() => {
    const iso = this.status()?.lastContactAt;
    return iso === undefined || iso === null ? 'Not yet' : `${relativeTime(iso)} (${new Date(iso).toLocaleString()})`;
  });
  protected readonly enrolled = computed(() => this.status()?.enrollmentState === 'enrolled');
  protected readonly canConnect = computed(() => {
    const status = this.status();
    return status !== null && !this.isHubWeb && status.enrollmentState !== 'enrolled';
  });
  protected readonly canDisconnect = computed(() => {
    const status = this.status();
    return status !== null && !this.isHubWeb && status.enrollmentState !== 'standalone';
  });

  // Connect
  protected readonly pairingText = signal('');
  protected readonly parsed = computed(() => parsePairingString(this.pairingText()));
  protected readonly pairingProblem = computed(() => {
    const text = this.pairingText().trim();
    if (text === '' || this.parsed() !== null) return null;
    return text.startsWith(PAIRING_STRING_PREFIX)
      ? 'That pairing string looks incomplete or damaged. Copy it again from the Hub in full.'
      : `That is not a DUDE pairing string. It starts with ${PAIRING_STRING_PREFIX}`;
  });
  protected readonly connecting = signal(false);
  protected readonly connectError = signal<string | null>(null);
  protected readonly connectDone = signal<string | null>(null);

  // Disconnect
  protected readonly step = signal<DisconnectStep>('idle');
  protected readonly disconnecting = signal(false);
  protected readonly disconnectError = signal<string | null>(null);
  protected readonly disconnectDone = signal<string | null>(null);
  private readonly confirmButton = viewChild<ElementRef<HTMLButtonElement>>('confirmButton');

  protected readonly short = shortId;
  protected readonly group = groupFingerprint;

  constructor() {
    void this.refresh();
    const stop = this.hub.onStatusChanged?.((next) => this.status.set(next));
    if (stop) inject(DestroyRef).onDestroy(stop);
    // Moving to a confirm step moves focus to its button.
    effect(() => this.confirmButton()?.nativeElement.focus());
  }

  protected async refresh(): Promise<void> {
    try {
      this.status.set(await this.hub.status());
      this.loadError.set(null);
      if (this.isHubWeb && this.hub.tlsFingerprint) this.tls.set(await this.hub.tlsFingerprint());
      if (this.isHubWeb || this.enrolled()) void this.session.refresh();
    } catch (error) {
      this.loadError.set(hubErrorText(error, 'The Hub status could not be read.'));
    }
  }

  protected onPairingInput(event: Event): void {
    this.pairingText.set((event.target as HTMLInputElement).value);
    this.connectError.set(null);
    this.connectDone.set(null);
  }

  protected async connect(): Promise<void> {
    const parts = this.parsed();
    if (parts === null || this.connecting()) return;
    this.connecting.set(true);
    this.connectError.set(null);
    this.connectDone.set(null);
    try {
      await this.hub.enroll(this.pairingText().trim());
      this.pairingText.set('');
      this.connectDone.set(`Connected to the Hub at ${parts.host}:${parts.port}.`);
      this.disconnectDone.set(null);
      await this.refresh();
    } catch (error) {
      this.connectError.set(hubErrorText(error, 'The device could not be connected.'));
    } finally {
      this.connecting.set(false);
    }
  }

  // Step 1 only explains; nothing is sent to the Hub.
  protected startDisconnect(): void {
    this.disconnectError.set(null);
    this.disconnectDone.set(null);
    this.step.set('confirm');
  }

  protected cancelDisconnect(): void {
    this.step.set('idle');
    this.disconnectError.set(null);
  }

  protected async confirmDisconnect(): Promise<void> {
    await this.runUnenroll(false);
  }

  protected startLocalOnly(): void {
    this.step.set('force-confirm');
  }

  protected async confirmLocalOnly(): Promise<void> {
    await this.runUnenroll(true);
  }

  private async runUnenroll(force: boolean): Promise<void> {
    if (this.disconnecting()) return;
    this.disconnecting.set(true);
    this.disconnectError.set(null);
    try {
      const result = await this.hub.unenroll(force);
      this.step.set('idle');
      this.disconnectDone.set(
        result.hubNotified
          ? 'Disconnected. The Hub was told. Local data stays on this device.'
          : 'Disconnected on this device only. The Hub keeps listing it until the owner revokes it there.',
      );
      await this.refresh();
    } catch (error) {
      if (!force && error instanceof HubAdminError && error.code === 'hub-unreachable') this.step.set('unreachable');
      this.disconnectError.set(hubErrorText(error, 'The device could not be disconnected.'));
    } finally {
      this.disconnecting.set(false);
    }
  }

  protected onEscape(): void {
    if (this.step() !== 'idle') this.cancelDisconnect();
  }
}
