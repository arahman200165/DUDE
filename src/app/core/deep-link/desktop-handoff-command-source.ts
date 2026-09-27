import { Injectable, Provider, inject } from '@angular/core';
import { Router } from '@angular/router';
import { COMMAND_SOURCE, CommandSource, PaletteCommand } from '../../shared/models/command-source.model';
import { ToolRegistryService } from '../registry/tool-registry.service';
import { DesktopHandoffService } from './desktop-handoff.service';

/**
 * Command Palette "Open in Desktop DUDE" for the current tool or Settings section, on the web only
 * (Phase 26 Item 8). Pipelines and projects stay in their own pages, where the per-install id
 * explanation can be shown first.
 */
@Injectable()
export class DesktopHandoffCommandSource implements CommandSource {
  private readonly router = inject(Router);
  private readonly registry = inject(ToolRegistryService);
  private readonly handoff = inject(DesktopHandoffService);

  commands(): readonly PaletteCommand[] {
    if (!this.handoff.enabled) return [];
    const path = this.router.url.split(/[?#]/)[0];
    const keywords = ['desktop', 'open in desktop', 'native', 'app', 'windows'];
    const tool = this.registry.getByRoute(path);
    if (tool) {
      return [
        {
          id: `native:open-in-desktop:${tool.id}`,
          kind: 'native',
          title: `Open ${tool.shortTitle ?? tool.title} in Desktop DUDE`,
          keywords,
          execute: () => void this.handoff.open({ action: 'open', target: 'tool', id: tool.id }),
        },
      ];
    }
    const section = /^\/settings\/([a-zA-Z0-9_-]+)$/.exec(path)?.[1];
    if (section) {
      return [
        {
          id: `native:open-in-desktop:settings:${section}`,
          kind: 'native',
          title: 'Open these Settings in Desktop DUDE',
          keywords,
          execute: () => void this.handoff.open({ action: 'open', target: 'settings', section }),
        },
      ];
    }
    return [];
  }
}

export const DESKTOP_HANDOFF_COMMAND_SOURCE_PROVIDERS: Provider[] = [
  DesktopHandoffCommandSource,
  { provide: COMMAND_SOURCE, useExisting: DesktopHandoffCommandSource, multi: true },
];
