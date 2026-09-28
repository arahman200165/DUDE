import { Component, computed, inject, signal } from '@angular/core';
import { PwaInstallService } from '../../core/pwa/pwa-install.service';
import { DesktopFeatureMarker } from '../../shared/components/desktop-feature-marker/desktop-feature-marker';
import { RouterLink } from '@angular/router';
import { CATEGORY_METADATA, ToolCategory, TOOL_CATEGORIES } from '../../shared/models/tool-category.model';
import { ToolDefinition } from '../../shared/models/tool-definition.model';
import { COMMAND_SOURCE } from '../../shared/models/command-source.model';
import { ToolRegistryService } from '../../core/registry/tool-registry.service';
import { UsageService } from '../../core/usage/usage.service';
import { FavoritesService } from '../../core/favorites/favorites.service';
import { PlatformService } from '../../core/platform/platform.service';
import { WorkspaceTemplateService } from '../../core/workspace/workspace-template.service';
import { ProjectService } from '../../core/project/project.service';
import { CategoryIcon } from '../../shared/components/category-icon/category-icon';
import { OfflineAvailability } from '../../shared/components/offline-badge/offline-availability.directive';
import { HomeRail } from './home-rail/home-rail';
import { HomePasteDropHero } from './home-paste-drop-hero/home-paste-drop-hero';
import { ResumeWorkPanel } from './resume-work-panel/resume-work-panel';
import { QuickRunPanel } from './quick-run-panel/quick-run-panel';
import { HomeActivityPanel } from './home-activity-panel/home-activity-panel';
import { CommandActionsRail } from './command-actions-rail/command-actions-rail';
import { ShortcutHint } from '../../shared/components/shortcut-hint/shortcut-hint';
import { CommandPaletteService } from '../command-palette/command-palette.service';

const RAIL_LIMIT = 8;
/** `NativeCommandSource`'s own id prefix for a clipboard Quick Action, kept in sync there. */
const QUICK_ACTION_ID_PREFIX = 'native:quick-action:';

@Component({
  selector: 'app-deck',
  imports: [
    RouterLink,
    CategoryIcon,
    OfflineAvailability,
    DesktopFeatureMarker,
    HomeRail,
    HomePasteDropHero,
    ResumeWorkPanel,
    QuickRunPanel,
    HomeActivityPanel,
    CommandActionsRail,
    ShortcutHint,
  ],
  templateUrl: './deck.html',
})
export class Deck {
  private readonly registry = inject(ToolRegistryService);
  protected readonly pwa = inject(PwaInstallService);
  private readonly usage = inject(UsageService);
  private readonly workspaceTemplates = inject(WorkspaceTemplateService);
  private readonly projects = inject(ProjectService);
  private readonly commandSources = inject(COMMAND_SOURCE);
  protected readonly favorites = inject(FavoritesService);
  protected readonly platform = inject(PlatformService);
  protected readonly paletteService = inject(CommandPaletteService);

  protected readonly meta = CATEGORY_METADATA;
  protected readonly query = signal('');

  /** Hidden entirely when empty — a first-time user sees today's plain grid, unchanged. */
  protected readonly recentTools = computed<readonly ToolDefinition[]>(() =>
    this.usage
      .mostRecent(RAIL_LIMIT)
      .map((id) => this.registry.getById(id))
      .filter((tool) => tool !== undefined),
  );

  /** Desktop-only (DUDE_PRD.md §21 Phase 25 Item 1) -- hidden entirely when empty, same precedent as Recently Used. */
  protected readonly recentWorkspaces = computed(() => this.workspaceTemplates.recentlyApplied(RAIL_LIMIT));
  protected readonly recentProjects = computed(() => this.projects.recentlyActivated(RAIL_LIMIT));

  /**
   * Both filtered views over the live `COMMAND_SOURCE` feed's `'native'`-kind commands (Item 4's
   * `NativeCommandSource`) -- never a second hand-rolled action list. Clipboard Actions is exactly
   * the per-quick-action commands; Native Capabilities is the small fixed set alongside them.
   */
  private readonly nativeCommands = computed(() => this.commandSources.flatMap((source) => source.commands()).filter((c) => c.kind === 'native'));
  protected readonly clipboardActions = computed(() => this.nativeCommands().filter((c) => c.id.startsWith(QUICK_ACTION_ID_PREFIX)));
  protected readonly nativeCapabilities = computed(() => this.nativeCommands().filter((c) => !c.id.startsWith(QUICK_ACTION_ID_PREFIX)));

  /**
   * Discovery facet from the Web Capability Matrix (Phase 26 Item 7). "Works fully in browser"
   * means the tool declares no platform capability, so it behaves identically on web and desktop.
   * "Desktop-enhanced" is everything else (weaker web fallback, or a desktop-only feature).
   */
  protected readonly platformFacet = signal<'all' | 'browser' | 'desktop'>('all');
  protected readonly facets = [
    { id: 'all', label: 'All' },
    { id: 'browser', label: 'Works fully in browser' },
    { id: 'desktop', label: 'Desktop-enhanced' },
  ] as const;

  protected readonly isFiltering = computed(() => this.query().trim().length > 0 || this.platformFacet() !== 'all');

  private readonly filteredGrouped = computed(() => {
    const facet = this.platformFacet();
    const results = (this.query().trim() ? this.registry.search(this.query()) : [...this.registry.getAll()]).filter((tool) => {
      if (facet === 'all') return true;
      const enhanced = this.registry.platformCapabilitiesOf(tool.id).length > 0;
      return facet === 'desktop' ? enhanced : !enhanced;
    });
    const grouped = new Map<ToolCategory, ToolDefinition[]>();
    for (const tool of results) {
      const bucket = grouped.get(tool.category) ?? [];
      bucket.push(tool);
      grouped.set(tool.category, bucket);
    }
    return grouped;
  });

  protected readonly grouped = computed(() =>
    this.isFiltering() ? this.filteredGrouped() : new Map(Object.entries(this.registry.groupedByCategory()) as [ToolCategory, ToolDefinition[]][]),
  );

  protected readonly categories = computed(() =>
    this.isFiltering() ? [...this.filteredGrouped().keys()] : TOOL_CATEGORIES,
  );

  protected readonly hasResults = computed(() => !this.isFiltering() || this.filteredGrouped().size > 0);

  protected onQueryInput(event: Event): void {
    this.query.set((event.target as HTMLInputElement).value);
  }

  /** Reuses the existing `--open-with-dude`/Explorer-association pipeline (`DesktopOpenService` picks
   *  up the resulting item off the same queue) -- this is only the picker trigger. */
  protected openFile(): void {
    void window.dude!.open.pickFile();
  }
}
