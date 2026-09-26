import { Injectable, inject } from '@angular/core';
import { CommandPaletteService } from '../../shell/command-palette/command-palette.service';
import { PlatformService } from './platform.service';
import { ToolRegistryService } from '../registry/tool-registry.service';
import { ToolLauncherService } from '../registry/tool-launcher.service';

/** Renderer-side listener for the native menu's fixed navigation commands. */
@Injectable({ providedIn: 'root' })
export class NativeMenuService {
  private readonly platform = inject(PlatformService);
  private readonly registry = inject(ToolRegistryService);
  private readonly launcher = inject(ToolLauncherService);
  private readonly palette = inject(CommandPaletteService);

  constructor() {
    if (!this.platform.isDesktop()) return;
    window.dude!.menu.onAction((action) => {
      if (action === 'preferences') {
        const preferences = this.registry.getAll().find((tool) => tool.nativeMenu?.preferences);
        if (preferences) this.launcher.open(preferences);
      }
      else if (action === 'command-palette') this.palette.open();
    });
    window.dude!.menu.ready();
  }
}
