import { Injectable, inject, inject as injectPlatformBridge } from '@angular/core';
import { PLATFORM_BRIDGE } from '../platform/platform-bridge.adapter';
import { PlatformService } from '../platform/platform.service';
import type { SecretStatusView, SecretVoidResult } from "@dude/contracts/shared/models/platform-bridge.model";

/**
 * Renderer client for desktop secrets (Phase 31B). A secret is addressed by a closed purpose
 * (`'ai.llmApiKey'`), never by a free-form key, and its value can never be read back: the renderer
 * can learn only whether it is set, a masked hint and whether it needs re-entry, and can replace or
 * remove it. The plaintext lives in the main process alone. Desktop-only; the web build reports
 * "not set" and refuses writes.
 */
@Injectable({ providedIn: 'root' })
export class SecretsService {
  private readonly platformBridgePort = injectPlatformBridge(PLATFORM_BRIDGE);
  private readonly platform = inject(PlatformService);

  async status(purpose: string): Promise<SecretStatusView> {
    if (!this.platform.isDesktop()) return { purpose, isSet: false, hint: null, needsReentry: false };
    return this.platformBridgePort.get()!.secrets.status(purpose);
  }

  async set(purpose: string, value: string): Promise<SecretVoidResult> {
    if (!this.platform.isDesktop()) return { ok: false, error: 'not-supported' };
    return this.platformBridgePort.get()!.secrets.set(purpose, value);
  }

  async remove(purpose: string): Promise<SecretVoidResult> {
    if (!this.platform.isDesktop()) return { ok: false, error: 'not-supported' };
    return this.platformBridgePort.get()!.secrets.remove(purpose);
  }
}
