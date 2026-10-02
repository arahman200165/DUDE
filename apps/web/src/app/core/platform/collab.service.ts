import { inject as injectPlatformBridge } from '@angular/core';
import { PLATFORM_BRIDGE } from './platform-bridge.adapter';
import { Injectable, inject } from '@angular/core';
import { PlatformService } from './platform.service';

export type CollabStartResult = { readonly ok: true; readonly url: string; readonly sessionCode: string } | { readonly ok: false; readonly error: string };

/**
 * Thin IPC wrapper for Stage 6's local collab server lifecycle
 * (start/stop/participant count). The actual Yjs document, WebSocket
 * connection, and sync/awareness protocol handling is tool-specific (see
 * `apps/web/src/app/tools/markdown-workspace/collab/`) — this service only ever
 * hands back an endpoint, the same "IPC starts a local server, then
 * ordinary web APIs take over" pattern `LlmProxyService` uses for Stage 4.
 */
@Injectable({ providedIn: 'root' })
export class CollabService {
  private readonly platformBridgePort = injectPlatformBridge(PLATFORM_BRIDGE);

  private readonly platform = inject(PlatformService);

  async startSession(): Promise<CollabStartResult> {
    if (!this.platform.isDesktop()) return { ok: false, error: 'not-supported' };
    return this.platformBridgePort.get()!.collab.startSession();
  }

  async stopSession(): Promise<void> {
    if (!this.platform.isDesktop()) return;
    await this.platformBridgePort.get()!.collab.stopSession();
  }

  async participantCount(): Promise<number> {
    if (!this.platform.isDesktop()) return 0;
    return this.platformBridgePort.get()!.collab.participantCount();
  }
}
