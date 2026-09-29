import type { PanelDefinition } from '../../../shared/models/panel-definition.model';

export const panel: PanelDefinition = {
  id: 'user-links',
  title: 'Link list',
  description: 'Saved http(s) links that open only when you click them.',
  load: () => import('./user-content-panel').then((m) => m.UserContentPanel),
  size: { minW: 3, minH: 2 },
  defaultPlacement: { order: 15, w: 6, h: 3 },
  multiInstance: true,
  userContent: 'link',
  dataDependencies: ['user-content'],
};
