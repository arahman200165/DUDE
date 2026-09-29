import type { PanelDefinition } from '../../../shared/models/panel-definition.model';

export const panel: PanelDefinition = {
  id: 'category-usage',
  title: 'Category usage',
  description: 'Opens by category, lifetime or last 7 days.',
  load: () => import('./category-usage-home-panel').then((m) => m.CategoryUsageHomePanel),
  size: { minW: 4, minH: 3 },
  defaultPlacement: { order: 11, w: 6, h: 4 },
  config: [{ key: 'limit', label: 'Categories to show', type: 'number', min: 3, max: 8, default: 5 }],
  deferUntilVisible: true,
  dataDependencies: ['usage', 'tool-registry'],
};
