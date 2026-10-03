import { Component, DestroyRef, ElementRef, computed, effect, inject, signal, viewChild } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import type { ConfirmPreview, DeviceInfo, PairingCodeResponse, SyncDeviceSummary } from '@dude/contracts/hub';
import { validateDisplayName } from '@dude/persistence';
import { HUB_ADMIN } from '../../../core/hub/hub-admin.token';
import { StatusGlyph } from '../../../shared/components/status-glyph/status-glyph';
import { DeviceSyncStats } from './hub/device-sync-stats';
import { hubErrorText, relativeTime } from './hub/hub-format';
import { HubOwnerSession } from './hub/hub-owner-session.service';
import { OwnerGate } from './hub/owner-gate';
import { PairingCodePanel } from './hub/pairing-code-panel';

interface RevokeFlow {
  readonly device: DeviceInfo;
  readonly preview: ConfirmPreview;
}
interface TrustFlow {
  readonly device: DeviceInfo;
  readonly trusted: boolean;
}

/**
 * Settings > Devices. The environment's device registry behind the owner gate.
 * Destructive-Action Contract: Revoke previews first (the Hub returns a one-shot confirm token) and only the
 * explicit Confirm applies it; Cancel and Escape drop the preview. Recovery trust asks for the owner password every time.
 */
@Component({
  selector: 'app-devices-settings',
  imports: [DeviceSyncStats, OwnerGate, PairingCodePanel, StatusGlyph],
  templateUrl: './devices-settings.html',
})
export class DevicesSettings {
  private readonly hub = inject(HUB_ADMIN);
  protected readonly session = inject(HubOwnerSession);
  /** Set by the Hub setup page, which sends a new owner here to pair their desktop. */
  protected readonly pairDesktopHint = inject(ActivatedRoute).snapshot.queryParamMap.get('hint') === 'pair-desktop';

  protected readonly devices = signal<readonly DeviceInfo[]>([]);
  protected readonly syncStats = signal<ReadonlyMap<string, SyncDeviceSummary> | null>(null);
  protected readonly syncError = signal<string | null>(null);
  protected readonly loading = signal(false);
  protected readonly loadError = signal<string | null>(null);
  protected readonly message = signal<string | null>(null);
  protected readonly actionError = signal<string | null>(null);
  protected readonly busy = signal(false);
  protected readonly now = signal(Date.now());

  protected readonly pairing = signal<PairingCodeResponse | null>(null);

  protected readonly renaming = signal<string | null>(null);
  protected readonly nameDraft = signal('');
  protected readonly nameError = computed(() => {
    if (this.renaming() === null) return null;
    const result = validateDisplayName(this.nameDraft());
    return result.ok ? null : result.error;
  });

  protected readonly revoke = signal<RevokeFlow | null>(null);

  protected readonly trust = signal<TrustFlow | null>(null);
  protected readonly trustPassword = signal('');

  private readonly confirmButton = viewChild<ElementRef<HTMLButtonElement>>('confirmButton');
  private readonly trustField = viewChild<ElementRef<HTMLInputElement>>('trustField');
  private readonly renameField = viewChild<ElementRef<HTMLInputElement>>('renameField');

  constructor() {
    const stop = this.hub.onStatusChanged?.(() => {
      if (this.session.signedIn()) void this.load(true);
    });
    if (stop) inject(DestroyRef).onDestroy(stop);
    effect(() => this.confirmButton()?.nativeElement.focus());
    effect(() => this.trustField()?.nativeElement.focus());
    effect(() => this.renameField()?.nativeElement.focus());
    // Load once the owner is in (and again after a re-sign-in).
    effect(() => {
      if (this.session.signedIn()) void this.load();
    });
  }

  protected async load(quiet = false): Promise<void> {
    if (!quiet) this.loading.set(true);
    try {
      this.devices.set(await this.hub.listDevices());
      this.loadError.set(null);
      this.now.set(Date.now());
    } catch (error) {
      if (!this.session.noteError(error, { unauthorizedMeansExpired: true })) this.loadError.set(hubErrorText(error, 'The device list could not be loaded.'));
    } finally {
      this.loading.set(false);
    }
    await this.loadSyncStats();
  }

  /** Sync stats are best effort: a Hub that predates sync, or a failed call, never hides the device list. */
  private async loadSyncStats(): Promise<void> {
    try {
      const summary = await this.hub.syncSummary();
      this.syncStats.set(new Map(summary.devices.map((d) => [d.deviceId, d])));
      this.syncError.set(null);
    } catch (error) {
      this.syncError.set(hubErrorText(error, 'Sync stats could not be loaded.'));
    }
  }

  protected seen(device: DeviceInfo): string {
    return relativeTime(device.lastSeenAt, this.now());
  }
  protected canTrust(device: DeviceInfo): boolean {
    return device.platform !== 'web' && device.revokedAt === null && device.unenrolledAt === null;
  }
  protected canRevoke(device: DeviceInfo): boolean {
    return device.revokedAt === null;
  }

  private async act<T>(work: () => Promise<T>, fallback: string): Promise<T | undefined> {
    if (this.busy()) return undefined;
    this.busy.set(true);
    this.actionError.set(null);
    this.message.set(null);
    try {
      return await work();
    } catch (error) {
      if (!this.session.noteError(error)) this.actionError.set(hubErrorText(error, fallback));
      return undefined;
    } finally {
      this.busy.set(false);
    }
  }

  // Pairing
  protected async pair(): Promise<void> {
    const code = await this.act(() => this.hub.createPairingCode(), 'A pairing code could not be created.');
    if (code) this.pairing.set(code);
  }

  // Rename
  protected startRename(device: DeviceInfo): void {
    this.renaming.set(device.deviceId);
    this.nameDraft.set(device.displayName);
    this.actionError.set(null);
  }
  protected cancelRename(): void {
    this.renaming.set(null);
  }
  protected async saveRename(device: DeviceInfo): Promise<void> {
    const result = validateDisplayName(this.nameDraft());
    if (!result.ok) return;
    const updated = await this.act(() => this.hub.renameDevice(device.deviceId, result.value), 'The device could not be renamed.');
    if (updated) {
      this.devices.update((list) => list.map((d) => (d.deviceId === updated.deviceId ? updated : d)));
      this.renaming.set(null);
      this.message.set(`Renamed to ${updated.displayName}.`);
    }
  }

  // Revoke: step 1 previews, step 2 applies with the preview's token.
  protected async startRevoke(device: DeviceInfo): Promise<void> {
    this.cancelTrust();
    const preview = await this.act(() => this.hub.revokeDevicePreview(device.deviceId), 'The revoke could not be previewed.');
    if (preview) this.revoke.set({ device, preview });
  }
  protected cancelRevoke(): void {
    this.revoke.set(null);
  }
  protected async confirmRevoke(): Promise<void> {
    const flow = this.revoke();
    if (flow === null) return;
    const done = await this.act(() => this.hub.revokeDevice(flow.device.deviceId, flow.preview.confirmToken), 'The device could not be revoked.');
    // A used or expired token is gone either way: start over from the preview.
    this.revoke.set(null);
    if (done) {
      this.message.set(`${flow.device.displayName} was revoked.`);
      await this.load(true);
    }
  }

  // Recovery trust
  protected startTrust(device: DeviceInfo): void {
    this.cancelRevoke();
    this.trust.set({ device, trusted: !device.recoveryTrusted });
    this.trustPassword.set('');
    this.actionError.set(null);
  }
  protected cancelTrust(): void {
    this.trust.set(null);
    this.trustPassword.set('');
  }
  protected async confirmTrust(): Promise<void> {
    const flow = this.trust();
    const password = this.trustPassword();
    if (flow === null || password === '') return;
    const updated = await this.act(() => this.hub.setRecoveryTrust(flow.device.deviceId, password, flow.trusted), 'Recovery trust could not be changed.');
    this.trustPassword.set('');
    if (updated) {
      this.devices.update((list) => list.map((d) => (d.deviceId === updated.deviceId ? updated : d)));
      this.trust.set(null);
      this.message.set(flow.trusted ? `${updated.displayName} can now reset the owner password.` : `${updated.displayName} is no longer trusted for recovery.`);
    }
  }

  protected onEscape(): void {
    if (this.revoke() !== null) this.cancelRevoke();
    else if (this.trust() !== null) this.cancelTrust();
    else if (this.renaming() !== null) this.cancelRename();
  }
}
