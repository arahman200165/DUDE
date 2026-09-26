import { AfterViewInit, Component, ElementRef, ViewChild, computed, inject, signal } from '@angular/core';
import { CdkTrapFocus } from '@angular/cdk/a11y';
import { CATEGORY_METADATA, ToolCategory, TOOL_CATEGORIES } from '../../shared/models/tool-category.model';
import { ToolDefinition } from '../../shared/models/tool-definition.model';
import { ToolRegistryService } from '../../core/registry/tool-registry.service';
import { ToolLauncherService } from '../../core/registry/tool-launcher.service';
import { CommandPaletteService } from './command-palette.service';
import { CategoryIcon } from '../../shared/components/category-icon/category-icon';

@Component({
  selector: 'app-command-palette',
  imports: [CdkTrapFocus, CategoryIcon],
  templateUrl: './command-palette.html',
})
export class CommandPalette implements AfterViewInit {
  private readonly registry = inject(ToolRegistryService);
  private readonly launcher = inject(ToolLauncherService);
  private readonly paletteService = inject(CommandPaletteService);

  @ViewChild('searchInput') private readonly searchInput?: ElementRef<HTMLInputElement>;

  protected readonly meta = CATEGORY_METADATA;
  protected readonly query = signal('');
  protected readonly selectedIndex = signal(0);

  private readonly results = computed(() => this.registry.search(this.query()));

  protected readonly groupedResults = computed(() => {
    const grouped = new Map<ToolCategory, ToolDefinition[]>();
    for (const tool of this.results()) {
      const bucket = grouped.get(tool.category) ?? [];
      bucket.push(tool);
      grouped.set(tool.category, bucket);
    }
    return TOOL_CATEGORIES.filter((category) => grouped.has(category)).map((category) => ({
      category,
      tools: grouped.get(category)!,
    }));
  });

  private readonly flatResults = computed(() => this.groupedResults().flatMap((group) => group.tools));

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
    const tool = this.flatResults()[this.selectedIndex()];
    if (tool) this.open(tool);
  }

  protected onEscape(): void {
    this.paletteService.close();
  }

  protected isSelected(tool: ToolDefinition): boolean {
    return this.flatResults()[this.selectedIndex()]?.id === tool.id;
  }

  protected open(tool: ToolDefinition): void {
    this.launcher.open(tool);
    this.paletteService.close();
  }
}
