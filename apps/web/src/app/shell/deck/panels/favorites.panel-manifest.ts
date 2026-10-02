import { inject } from '@angular/core';
import { FavoritesService } from '../../../core/favorites/favorites.service';
import type { PanelDefinition } from "@dude/domain/shared/models/panel-definition.model";

export const panel: PanelDefinition = {
  id: 'favorites',
  title: 'Favorites',
  description: 'Tools you pinned.',
  load: () => import('./favorites-panel').then((m) => m.FavoritesPanel),
  size: { minW: 4, minH: 1 },
  defaultPlacement: { order: 6, w: 12, h: 2 },
  multiInstance: true,
  config: [{ key: 'limit', label: 'Tools to show', type: 'number', min: 1, max: 40, default: 20 }],
  dataDependencies: ['favorites', 'tool-registry'],
  showWhen: () => inject(FavoritesService).pinnedTools().length > 0,
};
