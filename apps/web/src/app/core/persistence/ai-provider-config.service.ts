import { Injectable, inject, inject as injectPlatformBridge } from '@angular/core';
import { PLATFORM_BRIDGE } from '../platform/platform-bridge.adapter';
import { PlatformService } from '../platform/platform.service';
import type { AiProviderConfig, AiProviderConfigView, SecretVoidResult } from "@dude/contracts/shared/models/platform-bridge.model";

/**
 * AI provider base URL and model, owned by the desktop main process (`ai-provider` device doc) and read
 * or written over sender-checked IPC. The API key is a separate secret (`SecretsService`, purpose
 * `ai.llmApiKey`); this view carries only its status. Desktop-only.
 */
@Injectable({ providedIn: 'root' })
export class AiProviderConfigService {
  private readonly platformBridgePort = injectPlatformBridge(PLATFORM_BRIDGE);
  private readonly platform = inject(PlatformService);

  async get(): Promise<AiProviderConfigView | null> {
    if (!this.platform.isDesktop()) return null;
    return this.platformBridgePort.get()!.ai.getConfig();
  }

  async set(config: Partial<AiProviderConfig>): Promise<SecretVoidResult> {
    if (!this.platform.isDesktop()) return { ok: false, error: 'not-supported' };
    return this.platformBridgePort.get()!.ai.setConfig(config);
  }
}
