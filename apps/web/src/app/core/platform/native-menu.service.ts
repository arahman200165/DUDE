import { inject as injectPlatformBridge } from '@angular/core';
import { PLATFORM_BRIDGE } from './platform-bridge.adapter';
import { Injectable, inject } from '@angular/core';
import { Router } from '@angular/router';
import { CommandPaletteService } from '../../shell/command-palette/command-palette.service';
import { PlatformService } from './platform.service';
import { ToolRegistryService } from '../registry/tool-registry.service';
import { ToolLauncherService } from '../registry/tool-launcher.service';
import { TOOL_CATEGORIES } from "@dude/shared-types/shared/models/tool-category.model";
import type { NativeMenuToolInfo } from "@dude/contracts/shared/models/platform-bridge.model";

/** Renderer-side listener for the native menu's fixed navigation commands. */
@Injectable({ providedIn: 'root' })
export class NativeMenuService {
  private readonly platformBridgePort = injectPlatformBridge(PLATFORM_BRIDGE);

  private readonly platform = inject(PlatformService);
  private readonly registry = inject(ToolRegistryService);
  private readonly launcher = inject(ToolLauncherService);
  private readonly palette = inject(CommandPaletteService);
  private readonly router = inject(Router);
  private snapshotTimer: ReturnType<typeof setTimeout> | null = null;

  constructor() {
    if (!this.platform.isDesktop()) return;
    this.platformBridgePort.get()!.menu.onAction((action) => {
      if (action === 'preferences') void this.router.navigateByUrl('/settings');
      else if (action === 'command-palette') this.palette.open();
      else if (action.startsWith('tool:')) {
        const tool = this.registry.getById(action.slice(5));
        if (tool) this.launcher.open(tool);
      }
    });
    this.platformBridgePort.get()!.menu.ready();
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
      void this.platformBridgePort.get()!.menu.setToolMenuData(tools);
    }, 100);
  }
}
