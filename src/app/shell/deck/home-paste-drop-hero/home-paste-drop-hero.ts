import { Component } from '@angular/core';
import { PasteDetectPanel } from '../../../shared/components/paste-detect-panel/paste-detect-panel';
import { SmartFileDropZone } from '../../../shared/components/smart-file-drop-zone/smart-file-drop-zone';

/**
 * Home's paste-first hero (DUDE_PRD.md §21 Phase 24 Item 1) — the fastest path into DUDE becomes
 * "paste/drop something," with tool/category navigation (the grid below) remaining fully available.
 * Both halves are shared components, not duplicated logic: `PasteDetectPanel` is the same core
 * `/smart-paste` uses, `SmartFileDropZone` is Item 4's detection UI.
 */
@Component({
  selector: 'app-home-paste-drop-hero',
  imports: [PasteDetectPanel, SmartFileDropZone],
  templateUrl: './home-paste-drop-hero.html',
})
export class HomePasteDropHero {}
