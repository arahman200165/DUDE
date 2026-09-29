import type { PanelDefinition } from '../../../shared/models/panel-definition.model';

export const panel: PanelDefinition = {
  id: 'home-open-file',
  title: 'Open File',
  description: 'Pick a file from disk and route it to the matching tool.',
  load: () => import('./home-open-file-panel').then((m) => m.HomeOpenFilePanel),
  size: { minW: 2, minH: 1, maxW: 6 },
  defaultPlacement: { order: 4, w: 3, h: 1 },
  desktopOnly: true,
  webBehavior: 'omit',
  dataDependencies: ['platform'],
};
