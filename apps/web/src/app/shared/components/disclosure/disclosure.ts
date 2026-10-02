import { Component, input, model } from '@angular/core';

let nextId = 0;

/**
 * Progressive-disclosure primitive (Phase 30J.4). A labelled toggle that keeps a
 * region collapsed until asked for. Primary actions belong outside it; use it
 * for secondary explanation, advanced filters, and long lists.
 *
 * Open state is deliberately not persisted: every visit starts collapsed. The
 * `badge` (e.g. an active-filter count) and `summary` stay visible while
 * collapsed so hidden state is never invisible.
 */
@Component({
  selector: 'app-disclosure',
  templateUrl: './disclosure.html',
})
export class Disclosure {
  readonly label = input.required<string>();
  /** Short muted text shown beside the label while collapsed. */
  readonly summary = input('');
  /** Count/flag shown beside the label at all times (0, '' and undefined hide it). */
  readonly badge = input<number | string | undefined>(undefined);
  readonly open = model(false);

  protected readonly panelId = `app-disclosure-${nextId++}`;

  protected hasBadge(): boolean {
    const b = this.badge();
    return b !== undefined && b !== '' && b !== 0;
  }
}
