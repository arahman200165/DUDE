import { Injectable, Provider, inject, signal } from '@angular/core';
import { COMMAND_SOURCE, CommandSource, PaletteCommand } from '../../shared/models/command-source.model';
import { PlatformService } from './platform.service';
import { ShellChromeService } from './shell-chrome.service';
import { ToolRegistryService } from '../registry/tool-registry.service';
import { ToolLauncherService } from '../registry/tool-launcher.service';
import { WorkspaceLayoutService } from '../workspace/workspace-layout.service';

/**
 * Command Palette source for Preferences (DUDE_PRD.md §21 Phase 25 Item 4) -- "Open Settings" plus a
 * couple of instant, no-form toggles that would otherwise need a trip into the Settings tool. Each
 * toggle command's title reflects the *next* state, matching a checkbox's usual "click to flip"
 * affordance rather than a static label.
 */
@Injectable()
export class PreferencesCommandSource implements CommandSource {
  private readonly platform = inject(PlatformService);
  private readonly shellChrome = inject(ShellChromeService);
  private readonly registry = inject(ToolRegistryService);
  private readonly launcher = inject(ToolLauncherService);
  private readonly workspaceLayout = inject(WorkspaceLayoutService);
  private readonly launchOnLogin = signal(false);

  constructor() {
    if (this.platform.isDesktop()) void this.shellChrome.getLaunchOnLogin().then((enabled) => this.launchOnLogin.set(enabled));
  }

  commands(): readonly PaletteCommand[] {
    const commands: PaletteCommand[] = [
      {
        id: 'preference:open-settings',
        kind: 'preference',
        title: 'Open Settings',
        execute: () => {
          const tool = this.registry.getById('settings');
          if (tool) this.launcher.open(tool);
        },
      },
      {
        id: 'preference:toggle-reopen-on-restart',
        kind: 'preference',
        title: this.workspaceLayout.reopenOnRestart() ? 'Turn Off: Reopen Tabs on Restart' : 'Turn On: Reopen Tabs on Restart',
        execute: () => this.workspaceLayout.reopenOnRestart.set(!this.workspaceLayout.reopenOnRestart()),
      },
    ];

    if (this.platform.isDesktop()) {
      commands.push({
        id: 'preference:toggle-launch-on-login',
        kind: 'preference',
        title: this.launchOnLogin() ? 'Turn Off: Launch on Login' : 'Turn On: Launch on Login',
        execute: async () => {
          const next = !this.launchOnLogin();
          const result = await this.shellChrome.setLaunchOnLogin(next);
          if (result.ok) this.launchOnLogin.set(next);
        },
      });
    }

    return commands;
  }
}

export const PREFERENCES_COMMAND_SOURCE_PROVIDERS: Provider[] = [
  PreferencesCommandSource,
  { provide: COMMAND_SOURCE, useExisting: PreferencesCommandSource, multi: true },
];
