import type { PanelDefinition } from '../../../shared/models/panel-definition.model';

export const panel: PanelDefinition = {
  id: 'user-text',
  title: 'Text note',
  description: 'A note you write yourself, shown as plain text.',
  load: () => import('./user-content-panel').then((m) => m.UserContentPanel),
  size: { minW: 3, minH: 2 },
  defaultPlacement: { order: 14, w: 6, h: 3 },
  multiInstance: true,
  userContent: 'text',
  dataDependencies: ['user-content'],
};
