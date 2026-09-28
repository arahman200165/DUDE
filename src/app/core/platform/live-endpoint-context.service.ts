import { Injectable, signal } from '@angular/core';
import type { LiveCertificateSummary, StartTlsProtocol } from './network-types';

/**
 * Session-only, in-memory hand-off between the Phase 28 live-endpoint tools (never persisted). It
 * lets the Live Certificate Chain and TLS Inspector pass an already-fetched chain to the Revocation
 * and Certificate Transparency tools without refetching, and pre-fill a Watch List entry. Cleared
 * when consumed, like the workspace in-memory hand-off.
 */
export interface EndpointCertContext {
  readonly host: string;
  readonly port: number;
  readonly sni?: string;
  readonly starttlsProtocol?: StartTlsProtocol;
  readonly chain: readonly LiveCertificateSummary[];
  readonly ocspStapleBase64?: string | null;
}

@Injectable({ providedIn: 'root' })
export class LiveEndpointContextService {
  /** Chain context targeted at a specific tool id, consumed once by that tool on load. */
  private readonly forTool = new Map<string, EndpointCertContext>();
  /** A pending "watch this endpoint" request, surfaced to the Certificate Watch List. */
  readonly pendingWatch = signal<{ host: string; port: number; sni?: string; starttlsProtocol?: StartTlsProtocol } | null>(null);

  offerTo(toolId: string, context: EndpointCertContext): void { this.forTool.set(toolId, context); }
  take(toolId: string): EndpointCertContext | null { const context = this.forTool.get(toolId) ?? null; this.forTool.delete(toolId); return context; }
  requestWatch(entry: { host: string; port: number; sni?: string; starttlsProtocol?: StartTlsProtocol }): void { this.pendingWatch.set(entry); }
  takeWatch(): { host: string; port: number; sni?: string; starttlsProtocol?: StartTlsProtocol } | null { const value = this.pendingWatch(); this.pendingWatch.set(null); return value; }
}
