import { NgTemplateOutlet } from '@angular/common';
import { Component, DestroyRef, ElementRef, computed, effect, inject, signal, viewChild } from '@angular/core';
import { RouterLink } from '@angular/router';
import { PAIRING_STRING_PREFIX, parsePairingString } from '@dude/contracts/hub';
import { HUB_ADMIN } from '../../../core/hub/hub-admin.token';
import { HubAdminError, type HubStatus } from '../../../core/hub/hub-admin.port';
import { PlatformService } from '../../../core/platform/platform.service';
import { CopyButton } from '../../../shared/components/copy-button/copy-button';
import { Disclosure } from '../../../shared/components/disclosure/disclosure';
import { connectionKind, groupFingerprint, hubErrorText, relativeTime, shortId, HUB_CONNECTION_COPY } from './hub/hub-format';
import { DesktopNotificationsPanel } from './hub/desktop-notifications-panel';
import { HubJobsPanel } from './hub/hub-jobs-panel';
import { HubOwnerSession } from './hub/hub-owner-session.service';
import { HubStatusBadge } from './hub/hub-status-badge';
import { HubWebActionsPanel } from './hub/hub-web-actions-panel';
import { LocalHubPanel } from './hub/local-hub-panel';
import { OwnerGate } from './hub/owner-gate';
import { SyncSummaryPanel } from './hub/sync-summary-panel';
import { OwnerRecoveryPanel } from './hub/owner-recovery-panel';
import { PresenceSharingPanel } from './hub/presence-sharing-panel';

type DisconnectStep = 'idle' | 'confirm' | 'unreachable' | 'force-confirm';

const RECONNECT_AUTHORITY_COPY: Readonly<Record<'transferred' | 'instance-changed' | 'epoch-lower' | 'unknown', string>> = {
  transferred: 'This Hub was moved to another machine.',
  'instance-changed': 'This Hub was restored or replaced.',
  'epoch-lower': 'This Hub is older than one this device already used.',
  unknown: 'This is not the Hub this device was paired with.',
};

/** Owner-facing names of the two ways a device verifies its Hub (Milestone 838). The public-CA label states who can read the traffic. */
export const TRUST_LABEL_PINNED = 'Pinned certificate';
export const TRUST_LABEL_PUBLIC_CA = 'Public certificate authority (via Cloudflare — Cloudflare can read traffic)';
export const trustLabelOf = (mode: 'pinned' | 'public-ca' | undefined): string => (mode === 'public-ca' ? TRUST_LABEL_PUBLIC_CA : TRUST_LABEL_PINNED);

function pairingProblemOf(raw: string): string | null {
  const text = raw.trim();
  if (text === '' || parsePairingString(raw) !== null) return null;
  return text.startsWith(PAIRING_STRING_PREFIX)
    ? 'That pairing string looks incomplete or damaged. Copy it again from the Hub in full.'
    : `That is not a DUDE pairing string. It starts with ${PAIRING_STRING_PREFIX}`;
}

/**
 * Settings > Environment & Hub. Desktop: connection status, connect (pairing string) and disconnect.
 * Hub-served web: what this Hub is, its TLS pin and the owner session.
 * Destructive-Action Contract: Disconnect first only explains; the Confirm button is the second, deliberate
 * step, and a local-only disconnect needs its own confirmation.
 */
@Component({
  selector: 'app-environment-settings',
  imports: [CopyButton, DesktopNotificationsPanel, Disclosure, HubJobsPanel, HubStatusBadge, HubWebActionsPanel, LocalHubPanel, NgTemplateOutlet, OwnerGate, OwnerRecoveryPanel, PresenceSharingPanel, RouterLink, SyncSummaryPanel],
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
  /** Only a standalone device pairs from scratch; an enrolled one that lost its Hub, or was revoked, reconnects instead. */
  protected readonly canConnect = computed(() => {
    const status = this.status();
    return status !== null && !this.isHubWeb && status.enrollmentState === 'standalone';
  });
  /** The Hub changed under this device, its certificate no longer matches, or it was revoked: the owner reconnects it with a new pairing string (PD-073). */
  protected readonly needsReconnect = computed(() => {
    const status = this.status();
    return status !== null && !this.isHubWeb
      && (status.connection === 'authority-changed' || status.connection === 'untrusted-tls' || status.enrollmentState === 'revoked');
  });
  /**
   * An enrolled device that cannot reach its Hub at all. If the Hub was moved or restored elsewhere and the old one is gone, this
   * device never learns `transferred`, so the same reconnect panel is offered, collapsed (the Hub is usually just down for a while).
   */
  protected readonly offerMovedHubReconnect = computed(() => {
    const status = this.status();
    return status !== null && !this.isHubWeb && status.enrollmentState === 'enrolled' && !this.needsReconnect() && this.kind() === 'offline';
  });
  protected readonly reconnectReason = computed(() => {
    const status = this.status();
    if (status === null) return '';
    if (status.enrollmentState !== 'revoked' && this.kind() === 'offline') return 'This device cannot reach the Hub it was paired with.';
    if (status.connection === 'authority-changed') return RECONNECT_AUTHORITY_COPY[status.authority?.reason ?? 'unknown'];
    if (status.connection === 'untrusted-tls') return "This Hub's certificate no longer matches the one this device pinned.";
    return 'This device was revoked from the Hub.';
  });
  protected readonly canDisconnect = computed(() => {
    const status = this.status();
    return status !== null && !this.isHubWeb && status.enrollmentState !== 'standalone';
  });

  // Connect
  protected readonly pairingText = signal('');
  protected readonly parsed = computed(() => parsePairingString(this.pairingText()));
  protected readonly pairingProblem = computed(() => pairingProblemOf(this.pairingText()));
  protected readonly connecting = signal(false);
  protected readonly connectError = signal<string | null>(null);
  protected readonly connectDone = signal<string | null>(null);

  // Reconnect
  protected readonly reconnectText = signal('');
  protected readonly reconnectParsed = computed(() => parsePairingString(this.reconnectText()));
  protected readonly reconnectProblem = computed(() => pairingProblemOf(this.reconnectText()));
  protected readonly reconnectAcknowledged = signal(false);
  protected readonly trustLabel = trustLabelOf;
  /** The device's current trust (pinned for an older host that does not say). */
  protected readonly currentTrust = computed(() => ({ mode: this.status()?.trustMode ?? 'pinned', domain: this.status()?.trustDomain ?? null }));
  /**
   * The explicit confirmation a reconnect needs when its pairing string would move this device between pinned and public-CA trust, or to another public
   * domain (Milestone 838). Null when the string keeps the current trust. The agent re-checks it and refuses without it (`trust-change-unconfirmed`).
   */
  protected readonly reconnectTrustChange = computed<{ mode: 'pinned' | 'public-ca'; domain: string | null } | null>(() => {
    const parsed = this.reconnectParsed();
    if (parsed === null || this.status()?.enrollmentState === 'standalone') return null;
    const next = parsed.trustMode === 'public-ca' ? { mode: 'public-ca' as const, domain: parsed.host } : { mode: 'pinned' as const, domain: null };
    const current = this.currentTrust();
    return current.mode === next.mode && current.domain === next.domain ? null : next;
  });
  protected readonly trustChangeAcknowledged = signal(false);
  protected readonly reconnecting = signal(false);
  protected readonly reconnectError = signal<string | null>(null);
  protected readonly reconnectDone = signal<string | null>(null);
  protected readonly canReconnect = computed(() => this.reconnectText().trim() !== '' && this.reconnectAcknowledged() && !this.reconnecting()
    && (this.reconnectTrustChange() === null || this.trustChangeAcknowledged()));

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

  protected onReconnectInput(event: Event): void {
    this.reconnectText.set((event.target as HTMLInputElement).value);
    this.trustChangeAcknowledged.set(false);
    this.reconnectError.set(null);
    this.reconnectDone.set(null);
  }

  protected onTrustChangeAcknowledge(event: Event): void {
    this.trustChangeAcknowledged.set((event.target as HTMLInputElement).checked);
  }

  protected onReconnectAcknowledge(event: Event): void {
    this.reconnectAcknowledged.set((event.target as HTMLInputElement).checked);
  }

  /** Needs the pairing string and the ticked acknowledgement; nothing is sent otherwise. */
  protected async reconnect(): Promise<void> {
    if (!this.canReconnect()) return;
    this.reconnecting.set(true);
    this.reconnectError.set(null);
    this.reconnectDone.set(null);
    try {
      const trustChange = this.reconnectTrustChange();
      await this.hub.reconnect({ pairingString: this.reconnectText().trim(), acknowledged: true, ...(trustChange ? { trustChange } : {}) });
      this.reconnectText.set('');
      this.reconnectAcknowledged.set(false);
      this.trustChangeAcknowledged.set(false);
      this.reconnectDone.set('Reconnected. Nothing was shared yet: choose Merge, Use Hub or Keep local when sync asks.');
      await this.refresh();
    } catch (error) {
      this.reconnectError.set(hubErrorText(error, 'The device could not be reconnected.'));
    } finally {
      this.reconnecting.set(false);
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
