import { inject } from '@angular/core';
import type { PanelDefinition } from "@dude/domain/shared/models/panel-definition.model";
import { NativeCommandsService } from './native-commands.service';

export const panel: PanelDefinition = {
  id: 'clipboard-actions',
  title: 'Clipboard Actions',
  description: 'One-click actions on your clipboard.',
  load: () => import('./clipboard-actions-panel').then((m) => m.ClipboardActionsPanel),
  size: { minW: 4, minH: 1 },
  defaultPlacement: { order: 16, w: 12, h: 2 },
  desktopOnly: true,
  webBehavior: 'omit',
  dataDependencies: ['command-sources', 'platform'],
  showWhen: () => inject(NativeCommandsService).clipboardActions().length > 0,
};
