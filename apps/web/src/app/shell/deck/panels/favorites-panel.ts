import { Component, computed, inject } from '@angular/core';
import { FavoritesService } from '../../../core/favorites/favorites.service';
import { PANEL_CONTEXT, panelNumber } from '../../../shared/models/panel-context.model';
import { HomeRail } from '../home-rail/home-rail';

/** Pinned tools, live from `FavoritesService`; how many is per-instance config. */
@Component({
  selector: 'app-favorites-panel',
  imports: [HomeRail],
  template: `<app-home-rail title="Favorites" [tools]="tools()" />`,
})
export class FavoritesPanel {
  private readonly favorites = inject(FavoritesService);
  private readonly context = inject(PANEL_CONTEXT, { optional: true });

  protected readonly tools = computed(() => this.favorites.pinnedTools().slice(0, panelNumber(this.context, 'limit', 20)));
}
