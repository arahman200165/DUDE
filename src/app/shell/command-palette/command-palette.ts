import { AfterViewInit, Component, ElementRef, ViewChild, computed, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { CdkTrapFocus } from '@angular/cdk/a11y';
import { CATEGORY_METADATA, ToolCategory, TOOL_CATEGORIES } from '../../shared/models/tool-category.model';
import { COMMAND_SOURCE, CommandKind, PaletteCommand } from '../../shared/models/command-source.model';
import { COMMAND_KIND_LABEL, COMMAND_KIND_ORDER, searchCommands } from '../../core/registry/command-search';
import { PipelineStepRegistryService } from '../../core/pipeline/pipeline-step-registry.service';
import { CommandPaletteService } from './command-palette.service';
import { CategoryIcon } from '../../shared/components/category-icon/category-icon';

interface PaletteGroup {
  readonly key: string;
  readonly label: string;
  readonly category?: ToolCategory;
  readonly commands: readonly PaletteCommand[];
}

const GROUP_ORDER = [
  ...TOOL_CATEGORIES.map((category) => `tool:${category}`),
  ...COMMAND_KIND_ORDER.filter((kind) => kind !== 'tool'),
];

@Component({
  selector: 'app-command-palette',
  imports: [CdkTrapFocus, CategoryIcon],
  templateUrl: './command-palette.html',
})
export class CommandPalette implements AfterViewInit {
  private readonly sources = inject(COMMAND_SOURCE);
  private readonly paletteService = inject(CommandPaletteService);
  private readonly router = inject(Router);
  private readonly stepRegistry = inject(PipelineStepRegistryService);

  @ViewChild('searchInput') private readonly searchInput?: ElementRef<HTMLInputElement>;

  protected readonly meta = CATEGORY_METADATA;
  protected readonly query = signal('');
  protected readonly selectedIndex = signal(0);

  private readonly results = computed(() => searchCommands(this.sources.flatMap((source) => source.commands()), this.query()));

  protected readonly groupedResults = computed<readonly PaletteGroup[]>(() => {
    const grouped = new Map<string, PaletteCommand[]>();
    for (const command of this.results()) {
      const key = command.kind === 'tool' ? `tool:${command.category}` : command.kind;
      const bucket = grouped.get(key) ?? [];
      bucket.push(command);
      grouped.set(key, bucket);
    }
    return GROUP_ORDER.filter((key) => grouped.has(key)).map((key) => {
      const category = key.startsWith('tool:') ? key.slice(5) as ToolCategory : undefined;
      return {
        key,
        label: category ? CATEGORY_METADATA[category].label : COMMAND_KIND_LABEL[key as CommandKind],
        category,
        commands: grouped.get(key)!,
      };
    });
  });

  private readonly flatResults = computed(() => this.groupedResults().flatMap((group) => group.commands));

  ngAfterViewInit(): void {
    this.searchInput?.nativeElement.focus();
  }

  protected onQueryInput(event: Event): void {
    this.query.set((event.target as HTMLInputElement).value);
    this.selectedIndex.set(0);
  }

  protected onArrowDown(event: Event): void {
    event.preventDefault();
    const count = this.flatResults().length;
    if (count === 0) return;
    this.selectedIndex.set((this.selectedIndex() + 1) % count);
  }

  protected onArrowUp(event: Event): void {
    event.preventDefault();
    const count = this.flatResults().length;
    if (count === 0) return;
    this.selectedIndex.set((this.selectedIndex() - 1 + count) % count);
  }

  protected onEnter(): void {
    const command = this.flatResults()[this.selectedIndex()];
    if (command) this.open(command);
  }

  protected onEscape(): void {
    this.paletteService.close();
  }

  protected isSelected(command: PaletteCommand): boolean {
    return this.flatResults()[this.selectedIndex()]?.id === command.id;
  }

  protected open(command: PaletteCommand): void {
    void command.execute();
    this.paletteService.close();
  }

  /** The chip uses only cached pipeline step metadata; opening the palette never loads every tool. */
  protected canQuickRun(command: PaletteCommand): boolean {
    return !!command.toolId && (this.stepRegistry.get(command.toolId)?.accepts.includes('text') ?? false);
  }

  protected openQuickRun(command: PaletteCommand, event: Event): void {
    event.stopPropagation();
    if (!command.toolId) return;
    void this.router.navigate(['/quick-run'], { queryParams: { tool: command.toolId } });
    this.paletteService.close();
  }
}
