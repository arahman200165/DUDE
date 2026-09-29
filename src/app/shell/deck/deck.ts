import { Component, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { HomeLayoutService } from '../../core/home-layout/home-layout.service';
import { HomePanelService } from '../../core/home-panel/home-panel.service';
import { HomeCanvas } from './home-canvas/home-canvas';
import { migrateLegacyHomePanel } from './user-panels/legacy-home-panel-migration';

/**
 * Home (DUDE_PRD.md Phase 30D → user-designed in Phase 30I). Deck is now just the page chrome around
 * `HomeCanvas`, which renders whatever the layout store and the generated panel registry describe.
 * The shipped default arrangement follows 30D.1's order (compact search, Smart Entry, Favorites/
 * Recents, Resume Work, Quick Run, Insights, Browse Tools preview) but is assembled from panel
 * manifests, not from this file. It deliberately never renders the complete registry as its
 * dominant content; that's Browse Tools' (`/tools`) job — see `shell/AGENTS.md`.
 */
@Component({
  selector: 'app-deck',
  imports: [HomeCanvas, RouterLink],
  templateUrl: './deck.html',
})
export class Deck {
  constructor() {
    // Phase 30H.6 Notes & links now live in the layout store's text/link panels.
    migrateLegacyHomePanel(inject(HomePanelService), inject(HomeLayoutService));
  }
}
