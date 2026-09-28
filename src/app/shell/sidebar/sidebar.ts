import { Component, computed, inject } from '@angular/core';
import { DesktopFeatureMarker } from '../../shared/components/desktop-feature-marker/desktop-feature-marker';
import { RouterLink, RouterLinkActive } from '@angular/router';
import { CATEGORY_METADATA, TOOL_CATEGORIES } from '../../shared/models/tool-category.model';
import { ToolRegistryService } from '../../core/registry/tool-registry.service';
import { computeCatalogCounts } from '../../core/registry/browse-tools-counts';
import { WorkspaceLayoutService } from '../../core/workspace/workspace-layout.service';
import { FavoritesService } from '../../core/favorites/favorites.service';
import { CommandPaletteService } from '../command-palette/command-palette.service';
import { CategoryIcon } from '../../shared/components/category-icon/category-icon';
import { OfflineAvailability } from '../../shared/components/offline-badge/offline-availability.directive';
import { ShortcutHint } from '../../shared/components/shortcut-hint/shortcut-hint';

/**
 * Sidebar Information Architecture rewrite (DUDE_PRD.md §21 Phase 30B.1) — the tool list is now a
 * collapsed category index (counts, derived live from the registry, reusing Browse Tools' own
 * `computeCatalogCounts`) rather than an always-expanded wall of ~277 links. A category row links
 * into Browse Tools' filtered view (`/tools`, the ninth sanctioned shell exception — see
 * `shell/AGENTS.md`). Inline caret expansion and compact Favorites/Recents sections land in the
 * next two milestones (30B.1's own "optional explicit expansion"/"may receive" wording) — this
 * milestone ships the core collapsed-index change first.
 */
@Component({
  selector: 'app-sidebar',
  imports: [RouterLink, RouterLinkActive, CategoryIcon, OfflineAvailability, DesktopFeatureMarker, ShortcutHint],
  templateUrl: './sidebar.html',
})
export class Sidebar {
  private readonly registry = inject(ToolRegistryService);
  private readonly workspaceLayout = inject(WorkspaceLayoutService);
  private readonly favorites = inject(FavoritesService);
  protected readonly paletteService = inject(CommandPaletteService);

  protected readonly categories = TOOL_CATEGORIES;
  protected readonly meta = CATEGORY_METADATA;
  protected readonly grouped = computed(() => this.registry.groupedByCategory());
  protected readonly openTabCount = computed(() => this.workspaceLayout.openTabs().length);

  protected readonly counts = computed(() =>
    computeCatalogCounts(this.registry.getAll(), {
      hasWebUnavailableFeature: (id) => this.registry.hasWebUnavailableFeature(id),
      isFavorite: (id) => this.favorites.isToolPinned(id),
    }),
  );
}
