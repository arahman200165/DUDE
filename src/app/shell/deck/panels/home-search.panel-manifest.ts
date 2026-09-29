import type { PanelDefinition } from '../../../shared/models/panel-definition.model';

export const panel: PanelDefinition = {
  id: 'home-search',
  title: 'Search & Jump',
  description: 'Search tools and open the Command Palette.',
  load: () => import('./home-search-panel').then((m) => m.HomeSearchPanel),
  size: { minW: 4, minH: 1 },
  defaultPlacement: { order: 1, w: 12, h: 1 },
  dataDependencies: ['tool-registry', 'command-sources'],
};
