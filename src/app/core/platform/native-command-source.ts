import { Injectable, Provider, inject, signal } from '@angular/core';
import { COMMAND_SOURCE, CommandSource, PaletteCommand } from '../../shared/models/command-source.model';
import { PlatformService } from './platform.service';
import { ShellChromeService } from './shell-chrome.service';
import { ToolRegistryService } from '../registry/tool-registry.service';
import { ToolLauncherService } from '../registry/tool-launcher.service';
import type { QuickActionInfo } from './electron-bridge';

/**
 * Command Palette source for desktop-only native actions (DUDE_PRD.md §21 Phase 25 Item 4) --
 * "Check for Updates," "Open File…," "Manage Secrets," and one command per registered clipboard
 * Quick Action (`ShellChromeService.listQuickActions()`, run via `dude:quickActions:run`). Returns
 * `[]` on web -- there is no native menu, no updater, no OS file picker, and no clipboard quick-
 * action registry to surface there.
 *
 * "Manage Secrets" is a narrow, precedented exception to the no-hard-coded-tool-id rule (like
 * `NativeMenuService`'s onboarding→settings reference): it opens the `settings` tool directly rather
 * than through a declarative manifest flag, since there is exactly one settings surface and it will
 * stay that way.
 */
@Injectable()
export class NativeCommandSource implements CommandSource {
  private readonly platform = inject(PlatformService);
  private readonly shellChrome = inject(ShellChromeService);
  private readonly registry = inject(ToolRegistryService);
  private readonly launcher = inject(ToolLauncherService);
  private readonly quickActionInfos = signal<readonly QuickActionInfo[]>([]);

  constructor() {
    if (this.platform.isDesktop()) void this.shellChrome.listQuickActions().then((actions) => this.quickActionInfos.set(actions));
  }

  commands(): readonly PaletteCommand[] {
    if (!this.platform.isDesktop()) return [];

    const fixed: PaletteCommand[] = [
      { id: 'native:check-updates', kind: 'native', title: 'Check for Updates', execute: () => void window.dude!.update.checkForUpdates() },
      { id: 'native:open-file', kind: 'native', title: 'Open File…', execute: () => void window.dude!.open.pickFile() },
      {
        id: 'native:manage-secrets',
        kind: 'native',
        title: 'Manage Secrets',
        execute: () => {
          const tool = this.registry.getById('settings');
          if (tool) this.launcher.open(tool);
        },
      },
    ];

    const quickActions: PaletteCommand[] = this.quickActionInfos().map((action) => ({
      id: `native:quick-action:${action.id}`,
      kind: 'native' as const,
      title: action.label,
      execute: () => void window.dude!.quickActions.run(action.id),
    }));

    return [...fixed, ...quickActions];
  }
}

export const NATIVE_COMMAND_SOURCE_PROVIDERS: Provider[] = [
  NativeCommandSource,
  { provide: COMMAND_SOURCE, useExisting: NativeCommandSource, multi: true },
];
