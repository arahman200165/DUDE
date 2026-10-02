import { Component, computed, input } from '@angular/core';
import type { DnsLookupView } from "@dude/contracts/core/platform/network-live-types";

/** One DNS response: rcode, header flags, the three sections, EDNS, and transport diagnostics. */
@Component({
  selector: 'app-dns-response-view',
  templateUrl: './dns-response-view.html',
})
export class DnsResponseView {
  readonly result = input.required<DnsLookupView>();
  readonly compact = input(false);
  protected readonly flags = computed(() => {
    const flags = this.result().flags;
    return [
      { name: 'AA', on: flags.aa, title: 'Authoritative answer' },
      { name: 'TC', on: flags.tc, title: 'Truncated' },
      { name: 'RD', on: flags.rd, title: 'Recursion desired' },
      { name: 'RA', on: flags.ra, title: 'Recursion available' },
      { name: 'AD', on: flags.ad, title: 'Authenticated data (validated by the resolver)' },
      { name: 'CD', on: flags.cd, title: 'Checking disabled' },
    ];
  });
  protected readonly sections = computed(() => [
    { name: 'Answer', records: this.result().answers },
    { name: 'Authority', records: this.result().authority },
    { name: 'Additional', records: this.result().additional },
  ].filter((section) => section.name === 'Answer' || section.records.length));
}
