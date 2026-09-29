import { Component, computed, inject } from '@angular/core';
import { ToolRegistryService } from '../../../core/registry/tool-registry.service';
import { UsageService } from '../../../core/usage/usage.service';
import { PANEL_CONTEXT, panelNumber } from '../../../shared/models/panel-context.model';
import { ToolDefinition } from '../../../shared/models/tool-definition.model';
import { HomeRail } from '../home-rail/home-rail';

/** Recently used tools, live from `UsageService`; how many is per-instance config. */
@Component({
  selector: 'app-recent-tools-panel',
  imports: [HomeRail],
  template: `<app-home-rail title="Recently Used" [tools]="tools()" />`,
})
export class RecentToolsPanel {
  private readonly usage = inject(UsageService);
  private readonly registry = inject(ToolRegistryService);
  private readonly context = inject(PANEL_CONTEXT, { optional: true });

  protected readonly tools = computed<readonly ToolDefinition[]>(() =>
    this.usage
      .mostRecent(panelNumber(this.context, 'limit', 8))
      .map((id) => this.registry.getById(id))
      .filter((tool) => tool !== undefined),
  );
}
