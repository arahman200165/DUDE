import { Disclosure } from '../../shared/components/disclosure/disclosure';
import { Component } from '@angular/core';
import { PasteDetectPanel } from '../../shared/components/paste-detect-panel/paste-detect-panel';

/**
 * Smart Paste-Detection (`DUDE_PRD.md` §21 Phase 21 Item 3) — see `shell/AGENTS.md` for why this
 * is new shell surface area, sanctioned the same way `pipelines/` was for Item 2. Not a 278th
 * tool: no `TOOL_DEFINITIONS` entry, no category. The input+match-list core now lives in
 * `shared/components/paste-detect-panel/` (Phase 24 Milestone 415), shared with Home's paste-drop
 * hero — this component is just the page shell.
 */
@Component({
  selector: 'app-smart-paste',
  imports: [PasteDetectPanel, Disclosure],
  templateUrl: './smart-paste.html',
})
export class SmartPaste {}
