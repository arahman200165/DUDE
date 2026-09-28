import { Component, signal } from '@angular/core';
import { NetworkWorkbench } from '../../shared/components/network-workbench/network-workbench';
import { DesktopOnlyControl } from '../../shared/components/desktop-only-control/desktop-only-control';
import { DnsResponseView } from '../../shared/components/dns-response-view/dns-response-view';
import { DNS_RECORD_TYPES, type DnsRecordType, type DnsTransport, type NetworkRequest, type ResolverSpec } from '../../core/platform/network-types';
import type { ComparatorEntryView, ComparatorView, DnsLookupView } from '../../core/platform/network-live-types';

const MAX_CUSTOM = 5;

/**
 * Resolver Comparator (Phase 28 item 9, extending the Phase 27 DNS Propagation Tester): labeled
 * public presets, the system resolver, and up to five custom resolvers, each over its own
 * transport. It reports differences between the resolvers it asked — never "global propagation".
 */
@Component({
  selector: 'app-dns-propagation',
  imports: [NetworkWorkbench, DesktopOnlyControl, DnsResponseView],
  templateUrl: './dns-propagation.html',
})
export class DnsPropagationTool {
  protected readonly types = DNS_RECORD_TYPES.filter((type) => type !== 'PTR');
  protected readonly target = signal('');
  protected readonly recordType = signal<DnsRecordType>('A');
  protected readonly includePresets = signal(true);
  protected readonly includeSystem = signal(true);
  protected readonly dnssecOk = signal(false);
  protected readonly custom = signal<readonly ResolverSpec[]>([]);
  protected readonly maxCustom = MAX_CUSTOM;

  protected readonly build = (): NetworkRequest => ({
    kind: 'dns-propagation',
    target: this.target().trim(),
    recordType: this.recordType(),
    includePresets: this.includePresets(),
    includeSystem: this.includeSystem(),
    ...(this.dnssecOk() ? { dnssecOk: true } : {}),
    resolvers: this.custom().filter((entry) => entry.server.trim()).map((entry) => ({ ...entry, server: entry.server.trim(), label: entry.label.trim() || 'Custom' })),
  });

  protected text(event: Event): void { this.target.set((event.target as HTMLInputElement).value); }
  protected chooseType(event: Event): void { this.recordType.set((event.target as HTMLSelectElement).value as DnsRecordType); }
  protected toggle(field: 'includePresets' | 'includeSystem' | 'dnssecOk', event: Event): void { this[field].set((event.target as HTMLInputElement).checked); }
  protected addResolver(): void {
    if (this.custom().length < MAX_CUSTOM) this.custom.update((list) => [...list, { label: '', server: '', transport: 'classic' }]);
  }
  protected removeResolver(index: number): void { this.custom.update((list) => list.filter((_, i) => i !== index)); }
  protected updateResolver(index: number, field: 'label' | 'server' | 'transport', event: Event): void {
    const value = (event.target as HTMLInputElement | HTMLSelectElement).value;
    this.custom.update((list) => list.map((entry, i) => i === index ? { ...entry, [field]: field === 'transport' ? value as DnsTransport : value } : entry));
  }
  protected view(result: unknown): ComparatorView { return result as ComparatorView; }
  protected lookup(entry: ComparatorEntryView): DnsLookupView | null { return entry.error || !entry.flags ? null : entry as DnsLookupView; }
  protected valuesFor(view: ComparatorView, label: string): readonly string[] {
    return view.comparison.valuesByResolver.find((entry) => entry.label === label)?.values ?? [];
  }
  protected isDivergent(view: ComparatorView, label: string, value: string): boolean {
    return view.comparison.onlyIn.some((entry) => entry.label === label && entry.values.includes(value));
  }
}
