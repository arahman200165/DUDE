import type { PanelDefinition } from "@dude/domain/shared/models/panel-definition.model";

export const panel: PanelDefinition = {
  id: 'resume-work',
  title: 'Resume Work',
  description: 'Recent projects, recent workspaces, and pinned pipelines.',
  load: () => import('./resume-work-home-panel').then((m) => m.ResumeWorkHomePanel),
  size: { minW: 4, minH: 2 },
  defaultPlacement: { order: 7, w: 6, h: 3 },
  deferUntilVisible: true,
  dataDependencies: ['projects', 'workspaces', 'pipelines', 'favorites'],
};
