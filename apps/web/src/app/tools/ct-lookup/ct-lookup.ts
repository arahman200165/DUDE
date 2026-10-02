import { CtLookupTool_view } from "@dude/tool-engine/tools/ct-lookup/ct-lookup.embedded-engine";
import { Component, inject, signal } from '@angular/core';
import { NetworkWorkbench } from '../../shared/components/network-workbench/network-workbench';
import { DesktopOnlyControl } from '../../shared/components/desktop-only-control/desktop-only-control';
import { LiveEndpointContextService } from '../../core/platform/live-endpoint-context.service';
import type { LiveCertificateSummary, NetworkRequest } from "@dude/contracts/core/platform/network-types";
import type { CtView } from "@dude/contracts/core/platform/network-live-types";

/**
 * Certificate Transparency Lookup (Phase 28 item 20). Embedded SCTs (from a chain handed over by
 * the Live Certificate Chain tool) are decoded locally; the domain history search reaches crt.sh,
 * a named third party disclosed in the "Contacting:" strip.
 */
@Component({
  selector: 'app-ct-lookup',
  imports: [NetworkWorkbench, DesktopOnlyControl],
  templateUrl: './ct-lookup.html',
})
export class CtLookupTool {
  private readonly context = inject(LiveEndpointContextService);
  protected readonly domain = signal('');
  protected readonly includeSubdomains = signal(true);
  protected readonly search = signal(true);
  protected readonly endpoint = signal('');
  protected readonly chain = signal<readonly LiveCertificateSummary[] | null>(null);

  constructor() {
    const handoff = this.context.take('ct-lookup');
    if (handoff) { this.domain.set(handoff.host); this.chain.set(handoff.chain); }
  }

  protected readonly build = (): NetworkRequest => ({
    kind: 'ct-lookup', target: this.domain().trim(), ctSearch: this.search(), includeSubdomains: this.includeSubdomains(),
    ...(this.endpoint().trim() ? { ctEndpoint: this.endpoint().trim() } : {}),
    ...(this.chain()?.length ? { chainBase64: this.chain()!.map((entry) => entry.derBase64) } : {}),
  });
  protected text(field: 'domain' | 'endpoint', event: Event): void { this[field].set((event.target as HTMLInputElement).value); }
  protected toggle(field: 'includeSubdomains' | 'search', event: Event): void { this[field].set((event.target as HTMLInputElement).checked); }
  protected view = CtLookupTool_view;

}
