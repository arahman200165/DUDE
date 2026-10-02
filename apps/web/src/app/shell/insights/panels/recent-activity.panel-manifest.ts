import type { PanelDefinition } from "@dude/domain/shared/models/panel-definition.model";

export const panel: PanelDefinition = {
  id: 'recent-activity',
  title: 'Recent activity',
  description: 'Recent tool, pipeline, history and file activity.',
  load: () => import('./recent-activity-home-panel').then((m) => m.RecentActivityHomePanel),
  size: { minW: 5, minH: 3 },
  defaultPlacement: { order: 13, w: 6, h: 5 },
  multiInstance: true,
  config: [{ key: 'limit', label: 'Rows to show', type: 'number', min: 3, max: 50, default: 5 }],
  deferUntilVisible: true,
  dataDependencies: ['recents', 'tool-registry'],
};
