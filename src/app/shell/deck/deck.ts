import { Component } from '@angular/core';
import { HomeCanvas } from './home-canvas/home-canvas';

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
  imports: [HomeCanvas],
  templateUrl: './deck.html',
})
export class Deck {}
