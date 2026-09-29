import type { PanelDefinition } from '../../../shared/models/panel-definition.model';

export const panel: PanelDefinition = {
  id: 'quick-run',
  title: 'Quick Run',
  description: 'Run a text tool on the spot without opening its workspace.',
  load: () => import('./quick-run-panel').then((m) => m.QuickRunPanel),
  size: { minW: 4, minH: 2 },
  defaultPlacement: { order: 8, w: 6, h: 3 },
  deferUntilVisible: true,
  dataDependencies: ['tool-registry', 'favorites', 'usage'],
};
