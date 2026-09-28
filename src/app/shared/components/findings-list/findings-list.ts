import { Component, computed, input } from '@angular/core';
import { RouterLink } from '@angular/router';

export type FindingStatus = 'pass' | 'warn' | 'fail' | 'info' | 'untested';
export interface Finding {
  readonly id: string;
  readonly status: FindingStatus;
  readonly title: string;
  readonly detail?: string;
  /** Advisory class / RFC / reference text, e.g. "RFC 7457 §2.4 (POODLE-class)". */
  readonly reference?: string;
  /** Route of the specialist tool that explains this finding in depth. */
  readonly link?: string;
  readonly linkLabel?: string;
}

const ORDER: Record<FindingStatus, number> = { fail: 0, warn: 1, untested: 2, info: 3, pass: 4 };

/** Pass/warn/fail rows (Phase 28 HTTPS analyzer, TLS weaknesses, email auth, DNSSEC). No grades. */
@Component({
  selector: 'app-findings-list',
  imports: [RouterLink],
  templateUrl: './findings-list.html',
})
export class FindingsList {
  readonly findings = input.required<readonly Finding[]>();
  readonly title = input('Findings');
  protected readonly sorted = computed(() => [...this.findings()].sort((a, b) => ORDER[a.status] - ORDER[b.status]));
  protected readonly counts = computed(() => {
    const counts: Record<FindingStatus, number> = { pass: 0, warn: 0, fail: 0, info: 0, untested: 0 };
    for (const finding of this.findings()) counts[finding.status]++;
    return counts;
  });
  protected label(status: FindingStatus): string {
    return status === 'untested' ? 'not testable' : status;
  }
}
