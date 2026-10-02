import type { PanelDefinition } from "@dude/domain/shared/models/panel-definition.model";

export const panel: PanelDefinition = {
  id: 'user-shortcuts',
  title: 'Shortcuts',
  description: 'One-click shortcuts to tools, app pages, settings sections and actions.',
  load: () => import('./user-content-panel').then((m) => m.UserContentPanel),
  size: { minW: 3, minH: 2 },
  multiInstance: true,
  userContent: 'shortcut',
  dataDependencies: ['user-content'],
};
