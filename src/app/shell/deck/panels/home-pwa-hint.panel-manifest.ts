import { inject } from '@angular/core';
import { PwaInstallService } from '../../../core/pwa/pwa-install.service';
import type { PanelDefinition } from '../../../shared/models/panel-definition.model';

export const panel: PanelDefinition = {
  id: 'home-pwa-hint',
  title: 'Install prompt',
  description: 'Offers to install DUDE as an app when the browser supports it.',
  load: () => import('./home-pwa-hint-panel').then((m) => m.HomePwaHintPanel),
  size: { minW: 4, minH: 1 },
  defaultPlacement: { order: 3, w: 12, h: 1 },
  dataDependencies: ['platform'],
  showWhen: () => inject(PwaInstallService).showHint(),
};
