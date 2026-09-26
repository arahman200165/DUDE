import { Injectable, inject } from '@angular/core';
import { CommandPaletteService } from '../../shell/command-palette/command-palette.service';
import { PlatformService } from './platform.service';
import { ToolRegistryService } from '../registry/tool-registry.service';
import { ToolLauncherService } from '../registry/tool-launcher.service';
import { TOOL_CATEGORIES } from '../../shared/models/tool-category.model';
import type { NativeMenuToolInfo } from './electron-bridge';

/** Renderer-side listener for the native menu's fixed navigation commands. */
@Injectable({ providedIn: 'root' })
export class NativeMenuService {
  private readonly platform = inject(PlatformService);
  private readonly registry = inject(ToolRegistryService);
  private readonly launcher = inject(ToolLauncherService);
  private readonly palette = inject(CommandPaletteService);
  private snapshotTimer: ReturnType<typeof setTimeout> | null = null;

  constructor() {
    if (!this.platform.isDesktop()) return;
    window.dude!.menu.onAction((action) => {
      if (action === 'preferences') {
        const preferences = this.registry.getAll().find((tool) => tool.nativeMenu?.preferences);
        if (preferences) this.launcher.open(preferences);
      }
      else if (action === 'command-palette') this.palette.open();
      else if (action.startsWith('tool:')) {
        const tool = this.registry.getById(action.slice(5));
        if (tool) this.launcher.open(tool);
      }
    });
    window.dude!.menu.ready();
    this.refreshTools();
  }

  /** Debounced for future registry updates; today the generated registry is static at startup. */
  refreshTools(): void {
    if (!this.platform.isDesktop()) return;
    if (this.snapshotTimer) clearTimeout(this.snapshotTimer);
    this.snapshotTimer = setTimeout(() => {
      this.snapshotTimer = null;
      const definitions = this.registry.getAll();
      const tools: NativeMenuToolInfo[] = TOOL_CATEGORIES.flatMap((category) =>
        definitions.filter((tool) => tool.category === category).map((tool) => ({
          id: tool.id, title: tool.title, route: tool.route, category: tool.category,
        })),
      );
      void window.dude!.menu.setToolMenuData(tools);
    }, 100);
  }
}
