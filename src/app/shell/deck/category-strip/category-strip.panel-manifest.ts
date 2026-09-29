import type { PanelDefinition } from '../../../shared/models/panel-definition.model';

export const panel: PanelDefinition = {
  id: 'category-strip',
  title: 'Browse Tools',
  description: 'Category counts with a link into the full catalog.',
  load: () => import('./category-strip-panel').then((m) => m.CategoryStripPanel),
  size: { minW: 4, minH: 1 },
  defaultPlacement: { order: 18, w: 12, h: 2 },
  dataDependencies: ['tool-registry', 'favorites'],
};
