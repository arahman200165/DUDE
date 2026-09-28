import { Component } from '@angular/core';

/**
 * Compact, non-blocking disclosure documenting Browse Tools' optional query operators
 * (DUDE_PRD.md §21 Phase 30A.3) — a native `<details>` popover rather than a modal, so it never
 * interrupts browsing.
 */
@Component({
  selector: 'app-browse-query-help',
  templateUrl: './browse-query-help.html',
})
export class BrowseQueryHelp {}
