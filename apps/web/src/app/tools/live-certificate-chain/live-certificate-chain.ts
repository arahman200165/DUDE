import { Component, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { NetworkWorkbench } from '../../shared/components/network-workbench/network-workbench';
import { DesktopOnlyControl } from '../../shared/components/desktop-only-control/desktop-only-control';
import { CertChainView } from '../../shared/components/cert-chain-view/cert-chain-view';
import { LiveEndpointContextService } from '../../core/platform/live-endpoint-context.service';
import { STARTTLS_PROTOCOLS, type NetworkRequest, type StartTlsProtocol } from "@dude/contracts/core/platform/network-types";
import type { LiveChainView } from "@dude/contracts/core/platform/network-live-types";

/**
 * Live Certificate Chain Fetcher (Phase 28 item 16) + Hostname Mismatch Analyzer (item 23).
 * Hand-offs go through the session-only LiveEndpointContextService: the fetched chain is passed to
 * the Revocation and CT tools without refetching, and "Watch this endpoint" pre-fills the watch list.
 */
@Component({
  selector: 'app-live-certificate-chain',
  imports: [NetworkWorkbench, DesktopOnlyControl, CertChainView],
  templateUrl: './live-certificate-chain.html',
})
export class LiveCertificateChainTool {
  private readonly router = inject(Router);
  private readonly context = inject(LiveEndpointContextService);
  protected readonly starttlsProtocols = STARTTLS_PROTOCOLS;
  protected readonly host = signal('');
  protected readonly port = signal(443);
  protected readonly sni = signal('');
  protected readonly starttls = signal<'' | StartTlsProtocol>('');
  private lastResult: LiveChainView | null = null;

  protected readonly build = (): NetworkRequest => ({
    kind: 'live-chain', target: this.host().trim(), port: this.port(),
    ...(this.sni().trim() ? { sni: this.sni().trim() } : {}),
    ...(this.starttls() ? { starttlsProtocol: this.starttls() as StartTlsProtocol } : {}),
  });

  protected text(field: 'host' | 'sni', event: Event): void { this[field].set((event.target as HTMLInputElement).value); }
  protected setPort(event: Event): void { this.port.set(Number((event.target as HTMLInputElement).value)); }
  protected setStarttls(event: Event): void { this.starttls.set((event.target as HTMLSelectElement).value as '' | StartTlsProtocol); }
  protected view(result: unknown): LiveChainView | null { const value = result && (result as LiveChainView).chain ? result as LiveChainView : null; this.lastResult = value; return value; }

  private endpoint(): { host: string; port: number; sni?: string; starttlsProtocol?: StartTlsProtocol } {
    return { host: this.host().trim(), port: this.port(), ...(this.sni().trim() ? { sni: this.sni().trim() } : {}), ...(this.starttls() ? { starttlsProtocol: this.starttls() as StartTlsProtocol } : {}) };
  }
  protected watch(): void { this.context.requestWatch(this.endpoint()); void this.router.navigateByUrl('/tools/certificate-watch-list'); }
  protected drilldown(tool: 'revocation' | 'ct-lookup'): void {
    if (!this.lastResult) return;
    const target = tool === 'revocation' ? 'revocation-inspector' : 'ct-lookup';
    this.context.offerTo(target, { ...this.endpoint(), chain: this.lastResult.chain, ocspStapleBase64: this.lastResult.ocspStapleBase64 });
    void this.router.navigateByUrl(`/tools/${target}`);
  }
}
