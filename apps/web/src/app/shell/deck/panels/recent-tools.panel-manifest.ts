import { inject } from '@angular/core';
import { UsageService } from '../../../core/usage/usage.service';
import type { PanelDefinition } from "@dude/domain/shared/models/panel-definition.model";

export const panel: PanelDefinition = {
  id: 'recent-tools',
  title: 'Recently Used',
  description: 'Tools you opened most recently.',
  load: () => import('./recent-tools-panel').then((m) => m.RecentToolsPanel),
  size: { minW: 4, minH: 1 },
  defaultPlacement: { order: 5, w: 12, h: 2 },
  multiInstance: true,
  config: [{ key: 'limit', label: 'Tools to show', type: 'number', min: 1, max: 20, default: 8 }],
  dataDependencies: ['usage', 'tool-registry'],
  showWhen: () => inject(UsageService).mostRecent(1).length > 0,
};
