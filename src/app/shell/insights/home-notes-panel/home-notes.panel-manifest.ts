import type { PanelDefinition } from '../../../shared/models/panel-definition.model';

export const panel: PanelDefinition = {
  id: 'home-notes',
  title: 'Notes & links',
  description: 'Your own plain-text note and saved links, stored on this device.',
  load: () => import('./home-notes-panel').then((m) => m.HomeNotesPanel),
  size: { minW: 4, minH: 3 },
  defaultPlacement: { order: 14, w: 12, h: 3 },
  dataDependencies: ['user-content'],
};
