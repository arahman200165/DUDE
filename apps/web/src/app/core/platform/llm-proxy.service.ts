import { inject as injectPlatformBridge } from '@angular/core';
import { PLATFORM_BRIDGE } from './platform-bridge.adapter';
import type { LlmChatMessage } from "@dude/contracts/shared/models/llm-chat.model";
export type { LlmChatMessage } from "@dude/contracts/shared/models/llm-chat.model";
import { Injectable, inject } from '@angular/core';
import { PlatformService } from './platform.service';

/**
 * Renderer-side client for the desktop LLM integration. `chat()` is a single IPC call
 * (`dude:llm:chat`): main reads the stored provider config and API key, performs the provider
 * request and returns only the assistant text, so the key never reaches the renderer.
 */
@Injectable({ providedIn: 'root' })
export class LlmProxyService {
  private readonly platformBridgePort = injectPlatformBridge(PLATFORM_BRIDGE);

  private readonly platform = inject(PlatformService);

  async isConfigured(): Promise<boolean> {
    if (!this.platform.isDesktop()) return false;
    return this.platformBridgePort.get()!.llm.isConfigured();
  }

  async chat(messages: readonly LlmChatMessage[]): Promise<string> {
    if (!this.platform.isDesktop()) {
      throw new Error('AI features are only available in the desktop app.');
    }

    const result = await this.platformBridgePort.get()!.llm.chat({ messages });
    if (!result.ok) {
      throw new Error(result.error === 'not-configured' ? 'Configure an LLM provider in Settings to use AI features.' : result.error);
    }
    return result.content;
  }
}
