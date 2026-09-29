import { inject } from '@angular/core';
import type { PanelDefinition } from '../../../shared/models/panel-definition.model';
import { NativeCommandsService } from './native-commands.service';

export const panel: PanelDefinition = {
  id: 'native-capabilities',
  title: 'Native Capabilities',
  description: 'Desktop-only actions such as opening files and folders.',
  load: () => import('./native-capabilities-panel').then((m) => m.NativeCapabilitiesPanel),
  size: { minW: 4, minH: 1 },
  defaultPlacement: { order: 17, w: 12, h: 2 },
  desktopOnly: true,
  webBehavior: 'omit',
  dataDependencies: ['command-sources', 'platform'],
  showWhen: () => inject(NativeCommandsService).nativeCapabilities().length > 0,
};
