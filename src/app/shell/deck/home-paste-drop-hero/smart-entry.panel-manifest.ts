import type { PanelDefinition } from '../../../shared/models/panel-definition.model';

export const panel: PanelDefinition = {
  id: 'smart-entry',
  title: 'Smart Entry',
  description: 'Paste or drop content and jump to the matching tool.',
  load: () => import('./home-paste-drop-hero').then((m) => m.HomePasteDropHero),
  size: { minW: 4, minH: 1 },
  defaultPlacement: { order: 2, w: 12, h: 1 },
  dataDependencies: ['smart-paste', 'tool-registry'],
};
