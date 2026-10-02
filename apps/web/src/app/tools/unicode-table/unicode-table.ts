import { Component, OnDestroy, computed, inject, signal } from '@angular/core';
import { ToolShell } from '../../shared/components/tool-shell/tool-shell';
import { DataTable } from '../../shared/components/data-table/data-table';
import { SimpleColumnsPipe } from '../../shared/components/data-table/simple-columns.pipe';
import { BusyIndicator } from '../../shared/components/busy-indicator/busy-indicator';
import { ErrorPanel } from '../../shared/components/error-panel/error-panel';
import { PersistenceService } from '../../core/persistence/persistence.service';
import { WorkerClientService } from '../../core/workers/worker-client.service';
import { WorkerJob } from '../../core/workers/worker-job';
import { UNICODE_BLOCKS } from "@dude/tool-engine/shared/utils/unicode-blocks";
import { PAGE_SIZE, UnicodeTableRequest, UnicodeTableResult } from "@dude/tool-engine/tools/unicode-table/unicode-table-browse";

type Mode = 'browse' | 'search';
type SearchScope = 'all' | 'block';

@Component({
  selector: 'app-unicode-table',
  imports: [ToolShell, DataTable, SimpleColumnsPipe, BusyIndicator, ErrorPanel],
  templateUrl: './unicode-table.html',
})
export class UnicodeTable implements OnDestroy {
  private readonly persistence = inject(PersistenceService);
  private readonly workerClient = inject(WorkerClientService);

  protected readonly blocks = UNICODE_BLOCKS;

  protected readonly mode = this.persistence.signal<Mode>('unicode-table', 'mode', 'local', 'browse');
  protected readonly blockName = this.persistence.signal('unicode-table', 'blockName', 'local', 'Basic Latin');
  protected readonly searchQuery = this.persistence.signal('unicode-table', 'searchQuery', 'session', '');
  protected readonly searchScope = this.persistence.signal<SearchScope>('unicode-table', 'searchScope', 'local', 'block');

  protected readonly page = signal(0);
  protected readonly job = signal<WorkerJob<UnicodeTableResult> | null>(null);

  protected readonly pageCount = computed(() => {
    const block = this.blocks.find((b) => b.name === this.blockName());
    if (!block) return 1;
    return Math.max(1, Math.ceil((block.end - block.start + 1) / PAGE_SIZE));
  });

  protected readonly columns = ['Code Point', 'Char', 'Category', 'Block', 'Name'] as const;

  protected readonly rows = computed(() => {
    const result = this.job()?.result();
    if (!result) return [];
    return result.rows.map((row) => [
      row.codePointHex,
      row.char,
      `${row.categoryAbbreviation} — ${row.categoryLabel}`,
      row.block,
      row.name,
    ]);
  });

  constructor() {
    this.browse();
  }

  protected setMode(mode: Mode): void {
    this.mode.set(mode);
  }

  protected onBlockChange(event: Event): void {
    this.blockName.set((event.target as HTMLSelectElement).value);
    this.page.set(0);
    this.browse();
  }

  protected onSearchQueryChange(event: Event): void {
    this.searchQuery.set((event.target as HTMLInputElement).value);
  }

  protected setSearchScope(scope: SearchScope): void {
    this.searchScope.set(scope);
  }

  protected previousPage(): void {
    if (this.page() === 0) return;
    this.page.update((p) => p - 1);
    this.browse();
  }

  protected nextPage(): void {
    if (this.page() >= this.pageCount() - 1) return;
    this.page.update((p) => p + 1);
    this.browse();
  }

  protected browse(): void {
    this.run({ mode: 'browse', blockName: this.blockName(), page: this.page() });
  }

  protected search(): void {
    this.run({
      mode: 'search',
      query: this.searchQuery(),
      scope: this.searchScope(),
      blockName: this.blockName(),
    });
  }

  private run(payload: UnicodeTableRequest): void {
    this.job()?.cancel();
    this.job.set(
      this.workerClient.run<UnicodeTableRequest, UnicodeTableResult>(
        () => new Worker(new URL('./unicode-table.worker', import.meta.url), { type: 'module' }),
        payload,
      ),
    );
  }

  ngOnDestroy(): void {
    this.job()?.cancel();
  }
}
