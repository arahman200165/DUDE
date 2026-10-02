import { DnssecInspectorTool_view, DnssecInspectorTool_statusClass } from "@dude/tool-engine/tools/dnssec-inspector/dnssec-inspector.embedded-engine";
import { Component, signal } from '@angular/core';
import { NetworkWorkbench } from '../../shared/components/network-workbench/network-workbench';
import { DesktopOnlyControl } from '../../shared/components/desktop-only-control/desktop-only-control';
import { FindingsList, type Finding } from '../../shared/components/findings-list/findings-list';
import type { DnsRecordType, DnsTransport, NetworkRequest } from "@dude/contracts/core/platform/network-types";
import type { DnssecView } from "@dude/contracts/core/platform/network-live-types";

const TYPES: readonly DnsRecordType[] = ['A', 'AAAA', 'MX', 'TXT', 'NS', 'SOA', 'CAA', 'TLSA', 'HTTPS', 'DNSKEY', 'DS', 'CNAME', 'SRV'];

/**
 * DNSSEC Inspector (Phase 28 item 2). All validation happens in the main process
 * (`apps/desktop/network-dnssec.ts`): the resolver only transports DS/DNSKEY/RRSIG/NSEC data, and
 * its AD bit is shown next to — never instead of — the local verdict.
 */
@Component({
  selector: 'app-dnssec-inspector',
  imports: [NetworkWorkbench, DesktopOnlyControl, FindingsList],
  templateUrl: './dnssec-inspector.html',
})
export class DnssecInspectorTool {
  protected readonly types = TYPES;
  protected readonly target = signal('');
  protected readonly recordType = signal<DnsRecordType>('A');
  protected readonly transport = signal<DnsTransport>('classic');
  protected readonly resolver = signal('');

  protected readonly build = (): NetworkRequest => ({
    kind: 'dnssec-inspector', target: this.target().trim(), recordType: this.recordType(), resolverTransport: this.transport(),
    ...(this.resolver().trim() ? { resolver: this.resolver().trim() } : {}),
  });
  protected text(field: 'target' | 'resolver', event: Event): void { this[field].set((event.target as HTMLInputElement).value); }
  protected choose(field: 'recordType' | 'transport', event: Event): void {
    const value = (event.target as HTMLSelectElement).value;
    if (field === 'recordType') this.recordType.set(value as DnsRecordType); else this.transport.set(value as DnsTransport);
  }
  protected view = DnssecInspectorTool_view;

  protected findings(view: DnssecView): readonly Finding[] { return view.findings; }
  protected statusClass = DnssecInspectorTool_statusClass;

}
