import type { PanelDefinition } from '../../../shared/models/panel-definition.model';

export const panel: PanelDefinition = {
  id: 'insights-summary',
  title: 'Insights summary',
  description: 'A compact strip of local workbench metrics.',
  load: () => import('./insights-summary').then((m) => m.InsightsSummary),
  size: { minW: 4, minH: 2 },
  defaultPlacement: { order: 9, w: 12, h: 2 },
  deferUntilVisible: true,
  dataDependencies: ['usage', 'favorites', 'projects', 'workspaces'],
};
