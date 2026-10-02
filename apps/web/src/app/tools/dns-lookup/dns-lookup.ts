import { DnsLookupTool_view, DnsLookupTool_policyText } from "@dude/tool-engine/tools/dns-lookup/dns-lookup.embedded-engine";
import { Component, signal } from '@angular/core';
import { NetworkWorkbench } from '../../shared/components/network-workbench/network-workbench';
import { DesktopOnlyControl } from '../../shared/components/desktop-only-control/desktop-only-control';
import { DnsResponseView } from '../../shared/components/dns-response-view/dns-response-view';
import { DNS_RECORD_TYPES, type DnsRecordType, type DnsTransport, type NetworkRequest } from "@dude/contracts/core/platform/network-types";
import type { DnsLookupView } from "@dude/contracts/core/platform/network-live-types";

/** CA identifiers commonly seen in CAA `issue` values — suggestions only (mirrors apps/desktop/network-caa.ts). */
const CA_SUGGESTIONS = ['letsencrypt.org', 'pki.goog', 'digicert.com', 'sectigo.com', 'globalsign.com', 'amazon.com', 'godaddy.com', 'entrust.net', 'buypass.com', 'ssl.com', 'zerossl.com', 'harica.gr', 'actalis.it', 'identrust.com', 'microsoft.com'];

@Component({
  selector: 'app-dns-lookup',
  imports: [NetworkWorkbench, DesktopOnlyControl, DnsResponseView],
  templateUrl: './dns-lookup.html',
})
export class DnsLookupTool {
  protected readonly types = DNS_RECORD_TYPES.filter((type) => type !== 'PTR');
  protected readonly caSuggestions = CA_SUGGESTIONS;
  protected readonly target = signal('');
  protected readonly recordType = signal<DnsRecordType>('A');
  protected readonly transport = signal<DnsTransport>('classic');
  protected readonly resolver = signal('');
  protected readonly dnssecOk = signal(false);
  protected readonly checkingDisabled = signal(false);
  protected readonly caIdentifier = signal('');

  protected readonly build = (): NetworkRequest => ({
    kind: 'dns-lookup',
    target: this.target().trim(),
    recordType: this.recordType(),
    resolverTransport: this.transport(),
    ...(this.resolver().trim() ? { resolver: this.resolver().trim() } : {}),
    ...(this.dnssecOk() || ['DNSKEY', 'DS', 'RRSIG', 'NSEC', 'NSEC3'].includes(this.recordType()) ? { dnssecOk: true } : {}),
    ...(this.checkingDisabled() ? { checkingDisabled: true } : {}),
    ...(this.recordType() === 'CAA' && this.caIdentifier().trim() ? { caIdentifier: this.caIdentifier().trim() } : {}),
  });

  protected text(field: 'target' | 'resolver' | 'caIdentifier', event: Event): void { this[field].set((event.target as HTMLInputElement).value); }
  protected choose(field: 'recordType' | 'transport', event: Event): void {
    const value = (event.target as HTMLSelectElement).value;
    if (field === 'recordType') this.recordType.set(value as DnsRecordType); else this.transport.set(value as DnsTransport);
  }
  protected toggle(field: 'dnssecOk' | 'checkingDisabled', event: Event): void { this[field].set((event.target as HTMLInputElement).checked); }
  protected view = DnsLookupTool_view;

  protected policyText = DnsLookupTool_policyText;

}
