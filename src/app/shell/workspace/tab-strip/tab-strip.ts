import { Component, computed, inject } from '@angular/core';
import { ToolRegistryService } from '../../../core/registry/tool-registry.service';
import { WorkspaceLayoutService } from '../../../core/workspace/workspace-layout.service';
import { findLeafByToolId } from '../../../core/workspace/workspace.model';
import { CommandPaletteService } from '../../command-palette/command-palette.service';
import { CategoryIcon } from '../../../shared/components/category-icon/category-icon';
import { WorkspaceOverrides } from '../workspace-overrides/workspace-overrides';
import { CATEGORY_METADATA } from '../../../shared/models/tool-category.model';

/** Open-tools tab strip for the `/workspace` route. Every tool referenced is registry-resolved. */
@Component({
  selector: 'app-tab-strip',
  imports: [CategoryIcon, WorkspaceOverrides],
  templateUrl: './tab-strip.html',
})
export class TabStrip {
  private readonly registry = inject(ToolRegistryService);
  protected readonly layout = inject(WorkspaceLayoutService);
  private readonly paletteService = inject(CommandPaletteService);

  protected readonly meta = CATEGORY_METADATA;

  protected readonly tabs = computed(() =>
    this.layout
      .openTabs()
      .map((toolId) => this.registry.getById(toolId))
      .filter((definition) => definition !== undefined),
  );

  protected isVisible(toolId: string): boolean {
    return findLeafByToolId(this.layout.panelTree(), toolId) !== null;
  }

  protected isFocused(toolId: string): boolean {
    return this.layout.focusedToolId() === toolId;
  }

  protected focus(toolId: string): void {
    if (this.isVisible(toolId)) {
      this.layout.focusTab(toolId);
    } else {
      this.layout.openTool(toolId);
    }
  }

  protected close(toolId: string, event: Event): void {
    event.stopPropagation();
    this.layout.closeTab(toolId);
  }

  protected splitRight(toolId: string, event: Event): void {
    event.stopPropagation();
    this.layout.splitFocused(toolId);
  }

  protected openPicker(): void {
    this.paletteService.open();
  }
}
