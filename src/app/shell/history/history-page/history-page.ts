import { Component, computed, inject, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { ActivatedRoute } from '@angular/router';
import { ToolRegistryService } from '../../../core/registry/tool-registry.service';
import { HistoryService } from '../../../core/history/history.service';
import { HistoryHandoffService } from '../../../core/history/history-handoff.service';
import { HistoryEntry } from '../../../core/history/history.model';
import { CATEGORY_METADATA } from '../../../shared/models/tool-category.model';
import { CategoryIcon } from '../../../shared/components/category-icon/category-icon';
import { RecentsTab } from '../recents-tab/recents-tab';

type HistoryTab = 'history' | 'recents';

/**
 * `/history` route (DUDE_PRD.md §21 Phase 21 Item 5) — the fourth sanctioned shell/core exception.
 * See `shell/history/AGENTS.md`. The "Recents" tab (Phase 24 Item 13) extends this same exception
 * rather than adding a new route.
 */
@Component({
  selector: 'app-history-page',
  imports: [CategoryIcon, DatePipe, RecentsTab],
  templateUrl: './history-page.html',
})
export class HistoryPage {
  private readonly registry = inject(ToolRegistryService);
  private readonly route = inject(ActivatedRoute);
  private readonly handoff = inject(HistoryHandoffService);
  protected readonly history = inject(HistoryService);

  protected readonly activeTab = signal<HistoryTab>('history');
  protected readonly meta = CATEGORY_METADATA;
  protected readonly query = signal('');
  protected readonly toolFilter = signal<string | null>(this.route.snapshot.queryParamMap.get('tool'));
  protected readonly groupByTool = signal(false);

  protected readonly toolOptions = computed(() => {
    const ids = [...new Set(this.history.recent().map((entry) => entry.toolId))];
    return ids.map((id) => this.registry.getById(id)).filter((definition) => definition !== undefined);
  });

  protected readonly filtered = computed(() => {
    const tool = this.toolFilter();
    const query = this.query().trim().toLowerCase();
    return this.history.recent().filter((entry) => {
      if (tool && entry.toolId !== tool) return false;
      if (query && !entry.summary.toLowerCase().includes(query)) return false;
      return true;
    });
  });

  protected readonly grouped = computed(() => {
    const groups = new Map<string, HistoryEntry[]>();
    for (const entry of this.filtered()) {
      const bucket = groups.get(entry.toolId) ?? [];
      bucket.push(entry);
      groups.set(entry.toolId, bucket);
    }
    return [...groups.entries()];
  });

  protected toolDefinition(toolId: string) {
    return this.registry.getById(toolId);
  }

  protected onQueryInput(event: Event): void {
    this.query.set((event.target as HTMLInputElement).value);
  }

  protected setToolFilter(toolId: string): void {
    this.toolFilter.set(toolId === '' ? null : toolId);
  }

  protected toggleGroupByTool(): void {
    this.groupByTool.set(!this.groupByTool());
  }

  protected setActiveTab(tab: HistoryTab): void {
    this.activeTab.set(tab);
  }

  protected async open(entryId: string): Promise<void> {
    await this.handoff.open(entryId);
  }

  protected async remove(id: string, event: Event): Promise<void> {
    event.stopPropagation();
    await this.history.deleteOne(id);
  }

  protected async clearAll(): Promise<void> {
    if (confirm('Clear all local history? This cannot be undone.')) {
      await this.history.clearAll();
    }
  }
}
