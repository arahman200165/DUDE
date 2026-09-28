import { Component, inject, signal } from '@angular/core';
import { NetworkWorkbench } from '../../shared/components/network-workbench/network-workbench';
import { DesktopOnlyControl } from '../../shared/components/desktop-only-control/desktop-only-control';
import { LiveEndpointContextService } from '../../core/platform/live-endpoint-context.service';
import type { LiveCertificateSummary, NetworkRequest, RevocationAction } from '../../core/platform/network-types';
import type { RevocationView } from '../../core/platform/network-live-types';

/**
 * Certificate Revocation Inspector (Phase 28 items 18, 19) + AIA issuer fetch. It works on a chain
 * received from the Live Certificate Chain drill-down (via LiveEndpointContextService), or fetches
 * one for a host the user enters. It contacts only the CA-named URLs, and only when the user runs
 * the check — the URLs are shown first.
 */
@Component({
  selector: 'app-revocation-inspector',
  imports: [NetworkWorkbench, DesktopOnlyControl],
  templateUrl: './revocation-inspector.html',
})
export class RevocationInspectorTool {
  private readonly context = inject(LiveEndpointContextService);
  protected readonly host = signal('');
  protected readonly port = signal(443);
  protected readonly chain = signal<readonly LiveCertificateSummary[] | null>(null);
  protected readonly action = signal<RevocationAction | 'all'>('all');

  constructor() {
    const handoff = this.context.take('revocation-inspector');
    if (handoff) { this.host.set(handoff.host); this.port.set(handoff.port); this.chain.set(handoff.chain); }
  }

  protected readonly build = (): NetworkRequest => {
    const chain = this.chain();
    if (!chain?.length) throw new Error('Open this from the Live Certificate Chain tool (Check revocation), which passes the fetched chain.');
    const action = this.action();
    return { kind: 'revocation', target: this.host().trim(), port: this.port(), ...(action !== 'all' ? { revocationAction: action } : {}), chainBase64: chain.map((entry) => entry.derBase64) };
  };
  protected setAction(event: Event): void { this.action.set((event.target as HTMLSelectElement).value as RevocationAction | 'all'); }
  protected view(result: unknown): RevocationView | null { return result && (result as RevocationView).urls ? result as RevocationView : null; }
  protected statusClass(status?: string): string { return status === 'good' ? 'text-success' : status === 'revoked' ? 'text-error' : 'text-warning'; }
}
