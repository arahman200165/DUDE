import { CATEGORY_METADATA, TOOL_CATEGORIES } from '../../../shared/models/tool-category.model';
import type { PanelDefinition } from '../../../shared/models/panel-definition.model';

export const panel: PanelDefinition = {
  id: 'category-preview',
  title: 'Category preview',
  description: 'A bounded, favorites-and-most-used-first sample of tools per category.',
  load: () => import('./category-preview-section').then((m) => m.CategoryPreviewSection),
  size: { minW: 4, minH: 3 },
  defaultPlacement: { order: 18, w: 12, h: 6 },
  multiInstance: true,
  config: [
    {
      key: 'category',
      label: 'Category',
      type: 'select',
      options: [{ value: 'all', label: 'All categories' }, ...TOOL_CATEGORIES.map((c) => ({ value: c, label: CATEGORY_METADATA[c].label }))],
      default: 'all',
    },
  ],
  deferUntilVisible: true,
  dataDependencies: ['tool-registry', 'favorites', 'usage'],
};
