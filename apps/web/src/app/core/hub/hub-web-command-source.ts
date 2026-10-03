import { Injectable, Provider, inject } from '@angular/core';
import { COMMAND_SOURCE, CommandSource, PaletteCommand } from '../../shared/models/command-source.model';
import { HubWebLinkService } from './hub-web-link.service';

/** Command Palette "Open Hub web": desktop only, and only while this device is enrolled with a Hub (PD-062). */
@Injectable()
export class HubWebCommandSource implements CommandSource {
  private readonly link = inject(HubWebLinkService);

  commands(): readonly PaletteCommand[] {
    if (!this.link.canOpen()) return [];
    return [
      {
        id: 'native:open-hub-web',
        kind: 'native',
        title: 'Open Hub web',
        description: 'Opens your Hub’s web page in the default browser',
        keywords: ['hub', 'web', 'browser', 'admin', 'environment'],
        execute: () => this.link.open().catch(() => undefined),
      },
    ];
  }
}

export const HUB_WEB_COMMAND_SOURCE_PROVIDERS: Provider[] = [
  HubWebCommandSource,
  { provide: COMMAND_SOURCE, useExisting: HubWebCommandSource, multi: true },
];
