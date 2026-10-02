import { inject as injectPlatformBridge } from '@angular/core';
import { PLATFORM_BRIDGE } from './platform-bridge.adapter';
import { Injectable, signal } from '@angular/core';
import type { NetworkJobEvent, NetworkRequest } from "@dude/contracts/core/platform/network-types";

export interface NetworkRun {
  readonly id: string;
  readonly request: NetworkRequest;
  readonly createdAt: string;
  readonly result: unknown;
}

@Injectable({ providedIn: 'root' })
export class NetworkDiagnosticsService {
  private readonly platformBridgePort = injectPlatformBridge(PLATFORM_BRIDGE);

  readonly runs = signal<readonly NetworkRun[]>([]);
  private latestBody: { id: string; base64: string } | null = null;
  responseBody(id: string): string | undefined { return this.latestBody?.id === id ? this.latestBody.base64 : undefined; }

  private get bridge() {
    const network = this.platformBridgePort.get()?.network;
    if (!network) throw new Error('Native network diagnostics are available in Desktop DUDE.');
    return network;
  }

  async prepare(request: NetworkRequest) { const result = await this.bridge.prepare(request); if (!result.ok) throw new Error(result.error); return result; }

  async start(request: NetworkRequest, onEvent: (event: NetworkJobEvent) => void, token?: string): Promise<{ jobId: string; unsubscribe: () => void }> {
    const network = this.bridge;
    let ownId = '';
    const queued: NetworkJobEvent[] = [];
    const unsubscribe = network.onEvent((event) => {
      if (!ownId) { queued.push(event); return; }
      if (event.jobId === ownId) onEvent(event);
    });
    const result = await network.start(request, token);
    if (!result.ok) { unsubscribe(); throw new Error(result.error); }
    ownId = result.jobId;
    queued.filter((event) => event.jobId === ownId).forEach(onEvent);
    return { jobId: ownId, unsubscribe };
  }

  cancel(jobId: string): Promise<boolean> { return this.bridge.cancel(jobId); }

  addRun(request: NetworkRequest, result: unknown): NetworkRun {
    // Client identities (mTLS keys) and pasted mail headers never enter run history; packet captures are download-only.
    const { headers: _headers, body: _body, clientIdentity: _identity, dkimHeaders: _dkimHeaders, ...safeRequest } = request;
    const safeResult = result && typeof result === 'object' ? { ...result as Record<string, unknown> } : result;
    if (safeResult && typeof safeResult === 'object') { delete (safeResult as Record<string, unknown>)['bodyBase64']; delete (safeResult as Record<string, unknown>)['pcapngBase64']; }
    if (safeResult && typeof safeResult === 'object' && (safeResult as Record<string, unknown>)['headers']) { const headers = { ...(safeResult as Record<string, unknown>)['headers'] as Record<string, unknown> }; for (const name of Object.keys(headers)) if (['set-cookie', 'authorization', 'proxy-authorization'].includes(name.toLowerCase())) delete headers[name]; (safeResult as Record<string, unknown>)['headers'] = headers; }
    const run = { id: crypto.randomUUID(), request: safeRequest, createdAt: new Date().toISOString(), result: safeResult };
    const bodyBase64 = (result as { bodyBase64?: unknown })?.bodyBase64;
    if (typeof bodyBase64 === 'string') this.latestBody = { id: run.id, base64: bodyBase64 };
    this.runs.update((current) => [...current.slice(-99), run]);
    return run;
  }
}
