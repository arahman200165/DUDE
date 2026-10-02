import { inject as injectPlatformBridge } from '@angular/core';
import { PLATFORM_BRIDGE } from './platform-bridge.adapter';
import { Injectable, Provider, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { COMMAND_SOURCE, CommandSource, PaletteCommand } from '../../shared/models/command-source.model';
import { PlatformService } from './platform.service';
import { ShellChromeService } from './shell-chrome.service';
import type { QuickActionInfo } from "@dude/contracts/shared/models/platform-bridge.model";

/**
 * Command Palette source for desktop-only native actions (DUDE_PRD.md §21 Phase 25 Item 4) --
 * "Check for Updates," "Open File…," "Manage Secrets," and one command per registered clipboard
 * Quick Action (`ShellChromeService.listQuickActions()`, run via `dude:quickActions:run`). Returns
 * `[]` on web -- there is no native menu, no updater, no OS file picker, and no clipboard quick-
 * action registry to surface there.
 *
 * "Manage Secrets" opens the Settings shell destination's AI / LLM Provider section — a fixed app
 * route, not a tool id.
 */
@Injectable()
export class NativeCommandSource implements CommandSource {
  private readonly platformBridgePort = injectPlatformBridge(PLATFORM_BRIDGE);

  private readonly platform = inject(PlatformService);
  private readonly shellChrome = inject(ShellChromeService);
  private readonly router = inject(Router);
  private readonly quickActionInfos = signal<readonly QuickActionInfo[]>([]);

  constructor() {
    if (this.platform.isDesktop()) void this.shellChrome.listQuickActions().then((actions) => this.quickActionInfos.set(actions));
  }

  commands(): readonly PaletteCommand[] {
    if (!this.platform.isDesktop()) return [];

    const fixed: PaletteCommand[] = [
      { id: 'native:check-updates', kind: 'native', title: 'Check for Updates', execute: () => void this.platformBridgePort.get()!.update.checkForUpdates() },
      { id: 'native:open-file', kind: 'native', title: 'Open File…', execute: () => void this.platformBridgePort.get()!.open.pickFile() },
      {
        id: 'native:manage-secrets',
        kind: 'native',
        title: 'Manage Secrets',
        execute: () => void this.router.navigateByUrl('/settings/ai'),
      },
    ];

    const quickActions: PaletteCommand[] = this.quickActionInfos().map((action) => ({
      id: `native:quick-action:${action.id}`,
      kind: 'native' as const,
      title: action.label,
      execute: () => void this.platformBridgePort.get()!.quickActions.run(action.id),
    }));

    return [...fixed, ...quickActions];
  }
}

export const NATIVE_COMMAND_SOURCE_PROVIDERS: Provider[] = [
  NativeCommandSource,
  { provide: COMMAND_SOURCE, useExisting: NativeCommandSource, multi: true },
];
