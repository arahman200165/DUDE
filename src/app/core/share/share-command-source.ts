import { Injectable, Provider, inject } from '@angular/core';
import { Router } from '@angular/router';
import { COMMAND_SOURCE, CommandSource, PaletteCommand } from '../../shared/models/command-source.model';
import { ToolRegistryService } from '../registry/tool-registry.service';
import { ShareLinkService } from './share-link.service';

/**
 * Command Palette "Copy Link to <tool>" while a tool route is open (Phase 26 Item 12). Bare link
 * only. Embedding the input stays in ToolShell's Share menu, where its warning is visible.
 */
@Injectable()
export class ShareCommandSource implements CommandSource {
  private readonly router = inject(Router);
  private readonly registry = inject(ToolRegistryService);
  private readonly share = inject(ShareLinkService);

  commands(): readonly PaletteCommand[] {
    const tool = this.registry.getByRoute(this.router.url);
    const url = tool && this.share.linkFor(tool.id);
    if (!tool || !url) return [];
    return [
      {
        id: `navigation:copy-link:${tool.id}`,
        kind: 'navigation',
        title: `Copy Link to ${tool.shortTitle ?? tool.title}`,
        keywords: ['share', 'link', 'url', 'copy link', 'bookmark'],
        execute: () => navigator.clipboard.writeText(url),
      },
    ];
  }
}

export const SHARE_COMMAND_SOURCE_PROVIDERS: Provider[] = [
  ShareCommandSource,
  { provide: COMMAND_SOURCE, useExisting: ShareCommandSource, multi: true },
];
