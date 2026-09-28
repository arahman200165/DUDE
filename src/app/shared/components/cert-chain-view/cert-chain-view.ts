import { Component, inject, input, output } from '@angular/core';
import { Router } from '@angular/router';
import type { HostnameVerdict, LiveCertificateSummary, TrustVerdict } from '../../../core/platform/network-types';
import { writeStorageValue } from '../../../core/workspace/workspace-storage-bridge';
import { chainToPemBundle, derBase64ToPem } from '../../utils/network-contacts';
import { downloadFile } from '../../utils/download-file';

/**
 * Presentational view of a live-fetched certificate chain (Phase 28): per-certificate summary,
 * expiry, labeled trust verdicts, hostname verdict, and hand-offs into the Phase 12 file-based
 * tools. The hand-off writes the PEM into the target tool's own `session` input key — the same
 * mechanism `workspace-storage-bridge.ts` documents — and then navigates, so nothing is persisted
 * that the target tool wouldn't persist itself.
 */
@Component({
  selector: 'app-cert-chain-view',
  templateUrl: './cert-chain-view.html',
})
export class CertChainView {
  private readonly router = inject(Router);
  readonly chain = input.required<readonly LiveCertificateSummary[]>();
  readonly trust = input<readonly TrustVerdict[]>([]);
  readonly hostname = input<HostnameVerdict | null>(null);
  readonly endpoint = input('');
  /** Emits when the user asks to add this endpoint to the Certificate Watch List. */
  readonly watch = output<void>();
  readonly showWatch = input(false);
  /** Show drill-down links to the revocation and CT tools (they read the chain from the shared context). */
  readonly showDrilldown = input(false);
  readonly drilldown = output<'revocation' | 'ct-lookup'>();

  protected statusClass(days: number): string {
    return days < 0 ? 'text-error' : days <= 30 ? 'text-warning' : 'text-success';
  }
  protected expiryText(days: number): string {
    return days < 0 ? `expired ${-days} day${days === -1 ? '' : 's'} ago` : `${days} day${days === 1 ? '' : 's'} left`;
  }
  protected openInInspector(entry: LiveCertificateSummary): void {
    writeStorageValue('x509-certificate-inspector', 'input', 'session', derBase64ToPem(entry.derBase64));
    void this.router.navigateByUrl('/tools/x509-certificate-inspector');
  }
  protected openInChainTools(): void {
    writeStorageValue('certificate-chain-tools', 'input', 'session', chainToPemBundle(this.chain()));
    void this.router.navigateByUrl('/tools/certificate-chain-tools');
  }
  protected downloadPem(): void {
    const name = (this.endpoint() || 'certificate-chain').replace(/[^a-z0-9.-]+/gi, '_');
    downloadFile(new Blob([chainToPemBundle(this.chain())], { type: 'application/x-pem-file' }), `${name}.pem`);
  }
  protected copyPem(): void { void navigator.clipboard.writeText(chainToPemBundle(this.chain())); }
}
