import { Component } from '@angular/core';
import { InsightsSection } from '../insights-section/insights-section';

/**
 * `/insights` — the full local workbench insights destination (DUDE_PRD.md §21 Phase 30H). Shell
 * exception #10 (see `shell/AGENTS.md`): Home shows compact slices of the same panels.
 */
@Component({
  selector: 'app-insights-page',
  imports: [InsightsSection],
  templateUrl: './insights-page.html',
})
export class InsightsPage {}
