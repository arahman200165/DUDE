import { Injectable, inject } from '@angular/core';
import type { QuarantinePreviewResult, ResetApplyResult, ResetKind, ResetPreviewResult } from '@dude/contracts';
import { PLATFORM_BRIDGE } from '../platform/platform-bridge.adapter';
import { PersistenceService } from '../persistence/persistence.service';
import { ClearAllDataService } from '../workspace/clear-all-data';
import { HISTORY_DB_NAME } from '../history/history-repository';
import { NETWORK_HISTORY_DB_NAME } from '../platform/network-run-repository';
import { DeviceIdentityService } from './device-identity.service';

const WEB_TOKEN_TTL_MS = 60_000;

/**
 * The one two-step route to "Clear data" and "Reset this device", for desktop and web (Destructive-Action
 * Contract). `preview` only reads; `apply` needs the single-use token the preview returned. On desktop the
 * token is issued and enforced by main (bound to this window and the store digest); on web there is no
 * trust boundary, so the token is a client-side single-use 60 s guard that keeps "preview, then confirm"
 * the only path through the same UI. Web "Clear data" keeps the installation id; "Reset this device" also
 * mints a new one.
 */
@Injectable({ providedIn: 'root' })
export class DeviceResetService {
  private readonly bridge = inject(PLATFORM_BRIDGE);
  private readonly persistence = inject(PersistenceService);
  private readonly clearAllData = inject(ClearAllDataService);
  private readonly identity = inject(DeviceIdentityService);
  private webToken: { token: string; kind: ResetKind; expires: number } | null = null;

  preview(kind: ResetKind): Promise<ResetPreviewResult> {
    const store = this.bridge.get()?.store;
    return store ? store.reset.preview(kind) : this.previewWeb(kind);
  }

  apply(request: { kind: ResetKind; token: string }): Promise<ResetApplyResult> {
    const store = this.bridge.get()?.store;
    return store ? store.reset.apply(request) : this.applyWeb(request);
  }

  quarantinePreview(): Promise<QuarantinePreviewResult> {
    const store = this.bridge.get()?.store;
    return store ? store.recovery.quarantinePreview() : Promise.resolve({ ok: false, error: 'not-needed' });
  }

  quarantineApply(token: string): Promise<ResetApplyResult> {
    const store = this.bridge.get()?.store;
    return store ? store.recovery.quarantineApply(token) : Promise.resolve({ ok: false, error: 'unavailable' });
  }

  openFolder(): Promise<{ ok: boolean }> {
    const store = this.bridge.get()?.store;
    return store ? store.recovery.openFolder() : Promise.resolve({ ok: false });
  }

  private async previewWeb(kind: ResetKind): Promise<ResetPreviewResult> {
    const databases = await this.indexedDbNames();
    const token = crypto.randomUUID();
    const expires = Date.now() + WEB_TOKEN_TTL_MS;
    this.webToken = { token, kind, expires };
    return {
      ok: true,
      kind,
      token,
      counts: { 'saved settings': this.persistence.countClearable(), 'history databases': databases },
      expiresAt: new Date(expires).toISOString(),
      keepsIdentity: kind === 'clear-data',
      wipesSecrets: false,
    };
  }

  private async applyWeb(request: { kind: ResetKind; token: string }): Promise<ResetApplyResult> {
    const staged = this.webToken;
    this.webToken = null;
    if (!staged || staged.token !== request.token || staged.kind !== request.kind) return { ok: false, error: 'invalid-token' };
    if (staged.expires < Date.now()) return { ok: false, error: 'expired' };
    try {
      await this.clearAllData.clearAll();
      if (request.kind === 'reset-device') this.identity.resetInstallation();
      return { ok: true };
    } catch {
      return { ok: false, error: 'failed' };
    }
  }

  private async indexedDbNames(): Promise<number> {
    try {
      const list = (await indexedDB.databases?.()) ?? [];
      return list.filter((db) => db.name === HISTORY_DB_NAME || db.name === NETWORK_HISTORY_DB_NAME).length;
    } catch {
      return 0;
    }
  }
}
