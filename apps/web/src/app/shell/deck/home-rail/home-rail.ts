import { Component, input } from '@angular/core';
import { RouterLink } from '@angular/router';
import { ToolDefinition } from '../../../shared/models/tool-definition.model';
import { CATEGORY_METADATA } from "@dude/shared-types/shared/models/tool-category.model";
import { CategoryIcon } from '../../../shared/components/category-icon/category-icon';
import { OfflineAvailability } from '../../../shared/components/offline-badge/offline-availability.directive';

/**
 * A generic, horizontally-scrollable rail of tool cards — shared by Home's "Recently Used" and
 * "Favorites" rails (DUDE_PRD.md §21 Phase 24 Items 6/7). Deck only ever renders at `/`, never
 * inside `/workspace`, so a plain `routerLink` (matching the existing category grid below it) is
 * correct here — no need for `ToolLauncherService`'s workspace-aware branch, which only matters for
 * a surface that can render while a Workspace panel is active (e.g. `ToolShell`'s related-tools
 * panel).
 */
@Component({
  selector: 'app-home-rail',
  imports: [RouterLink, CategoryIcon, OfflineAvailability],
  templateUrl: './home-rail.html',
})
export class HomeRail {
  readonly title = input.required<string>();
  readonly tools = input.required<readonly ToolDefinition[]>();

  protected readonly meta = CATEGORY_METADATA;
}
