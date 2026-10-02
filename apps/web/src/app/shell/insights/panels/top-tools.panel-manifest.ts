import type { PanelDefinition } from "@dude/domain/shared/models/panel-definition.model";

export const panel: PanelDefinition = {
  id: 'top-tools',
  title: 'Top tools',
  description: 'Your most-used tools by lifetime opens.',
  load: () => import('./top-tools-home-panel').then((m) => m.TopToolsHomePanel),
  size: { minW: 5, minH: 3 },
  defaultPlacement: { order: 12, w: 6, h: 5 },
  config: [{ key: 'limit', label: 'Rows to show', type: 'number', min: 3, max: 15, default: 5 }],
  deferUntilVisible: true,
  dataDependencies: ['usage', 'favorites', 'tool-registry'],
};
