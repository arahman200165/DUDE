import type { PanelDefinition } from '../../../shared/models/panel-definition.model';

export const panel: PanelDefinition = {
  id: 'activity-trend',
  title: 'Activity trend',
  description: 'Tool opens per day over the last 7 days.',
  load: () => import('./activity-trend-panel').then((m) => m.ActivityTrendPanel),
  size: { minW: 4, minH: 3 },
  defaultPlacement: { order: 10, w: 6, h: 4 },
  deferUntilVisible: true,
  dataDependencies: ['usage'],
};
