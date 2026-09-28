import { Component, computed, inject, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { PwaInstallService } from '../../core/pwa/pwa-install.service';
import { ToolDefinition } from '../../shared/models/tool-definition.model';
import { COMMAND_SOURCE } from '../../shared/models/command-source.model';
import { ToolRegistryService } from '../../core/registry/tool-registry.service';
import { UsageService } from '../../core/usage/usage.service';
import { FavoritesService } from '../../core/favorites/favorites.service';
import { PlatformService } from '../../core/platform/platform.service';
import { WorkspaceTemplateService } from '../../core/workspace/workspace-template.service';
import { ProjectService } from '../../core/project/project.service';
import { HomeRail } from './home-rail/home-rail';
import { HomePasteDropHero } from './home-paste-drop-hero/home-paste-drop-hero';
import { ResumeWorkPanel } from './resume-work-panel/resume-work-panel';
import { QuickRunPanel } from './quick-run-panel/quick-run-panel';
import { InsightsSection } from '../insights/insights-section/insights-section';
import { CategoryStrip } from './category-strip/category-strip';
import { CategoryPreviewSection } from './category-preview-section/category-preview-section';
import { CommandActionsRail } from './command-actions-rail/command-actions-rail';
import { ShortcutHint } from '../../shared/components/shortcut-hint/shortcut-hint';
import { CommandPaletteService } from '../command-palette/command-palette.service';

const RAIL_LIMIT = 8;
/** `NativeCommandSource`'s own id prefix for a clipboard Quick Action, kept in sync there. */
const QUICK_ACTION_ID_PREFIX = 'native:quick-action:';

/**
 * Bounded default Home (DUDE_PRD.md §21 Phase 30D) — the shipped default layout follows 30D.1's
 * order (compact shell/search, Smart Entry, Favorites/Recents, Resume Work, Quick Run, Activity,
 * Browse Tools preview, explicit "Browse all tools"). It deliberately never renders the complete
 * registry as its dominant content; that's Browse Tools' (`/tools`) job — see `shell/AGENTS.md`.
 */
@Component({
  selector: 'app-deck',
  imports: [
    RouterLink,
    HomeRail,
    HomePasteDropHero,
    ResumeWorkPanel,
    QuickRunPanel,
    InsightsSection,
    CategoryStrip,
    CategoryPreviewSection,
    CommandActionsRail,
    ShortcutHint,
  ],
  templateUrl: './deck.html',
})
export class Deck {
  private readonly registry = inject(ToolRegistryService);
  private readonly router = inject(Router);
  protected readonly pwa = inject(PwaInstallService);
  private readonly usage = inject(UsageService);
  private readonly workspaceTemplates = inject(WorkspaceTemplateService);
  private readonly projects = inject(ProjectService);
  private readonly commandSources = inject(COMMAND_SOURCE);
  protected readonly favorites = inject(FavoritesService);
  protected readonly platform = inject(PlatformService);
  protected readonly paletteService = inject(CommandPaletteService);

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

  protected onQueryInput(event: Event): void {
    this.query.set((event.target as HTMLInputElement).value);
  }

  /** Hands off to Browse Tools' own filtering/query-syntax rather than re-deriving a second
   *  search-and-filter implementation on Home (DUDE_PRD.md §21 Phase 30D.1). */
  protected search(): void {
    const trimmed = this.query().trim();
    void this.router.navigate(['/tools'], trimmed ? { queryParams: { q: trimmed } } : {});
  }

  /** Reuses the existing `--open-with-dude`/Explorer-association pipeline (`DesktopOpenService` picks
   *  up the resulting item off the same queue) -- this is only the picker trigger. */
  protected openFile(): void {
    void window.dude!.open.pickFile();
  }
}
