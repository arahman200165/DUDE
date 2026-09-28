import { Component, computed, inject, signal } from '@angular/core';
import { ScrollingModule } from '@angular/cdk/scrolling';
import type { PlanPreview, WalkOptions } from '../../../shared-logic/fs/fs-types';
import { DEFAULT_WALK_OPTIONS } from '../../../shared-logic/fs/walk-filter';
import { formatBytes } from '../../../shared-logic/fs/format-size';
import { DEFAULT_CONVERT, type ConvertOptions, type TextInventory } from '../../../shared-logic/fs/text-convert';
import { ToolShell } from '../../shared/components/tool-shell/tool-shell';
import { DesktopOnlyControl } from '../../shared/components/desktop-only-control/desktop-only-control';
import { FsRootPicker } from '../../shared/components/fs-root-picker/fs-root-picker';
import { WalkOptionsPanel } from '../../shared/components/walk-options/walk-options';
import { ScanProgress } from '../../shared/components/scan-progress/scan-progress';
import { MutationPreview } from '../../shared/components/mutation-preview/mutation-preview';
import { PlatformService } from '../../core/platform/platform.service';
import { PersistenceService } from '../../core/persistence/persistence.service';
import { FsJobService, type FsJobHandle } from '../../core/platform/fs-job.service';

const TOOL_ID = 'batch-text-converter';
interface InventoryRow extends TextInventory { readonly path: string; readonly size: number; readonly encoding: string; readonly bom: boolean }
type RowFilter = 'all' | 'crlf' | 'lf' | 'mixed' | 'non-utf8' | 'bom' | 'no-final-newline' | 'trailing' | 'tabs' | 'spaces' | 'mixed-indent';

const ROW_FILTERS: Readonly<Record<RowFilter, (row: InventoryRow) => boolean>> = {
  all: () => true,
  crlf: (row) => row.eol === 'crlf',
  lf: (row) => row.eol === 'lf',
  mixed: (row) => row.eol === 'mixed',
  'non-utf8': (row) => row.encoding !== 'utf8',
  bom: (row) => row.bom,
  'no-final-newline': (row) => !row.finalNewline && row.size > 0,
  trailing: (row) => row.trailingWhitespaceLines > 0,
  tabs: (row) => row.indent === 'tabs',
  spaces: (row) => row.indent === 'spaces',
  'mixed-indent': (row) => row.indent === 'mixed',
};

/**
 * Batch Text Converter (DUDE_PRD.md §21 Phase 29 items 7 and 8, Milestone 531): inventory a tree's
 * line endings, encodings, BOMs, final newlines, trailing whitespace and indentation, then convert
 * them — explicitly, or per file from the tree's own `.editorconfig` files. Re-encoding runs through
 * iconv-lite in the fs worker with a round-trip loss check; writes go through the mutation engine.
 */
@Component({
  selector: 'app-batch-text-converter',
  imports: [ToolShell, DesktopOnlyControl, FsRootPicker, WalkOptionsPanel, ScanProgress, MutationPreview, ScrollingModule],
  templateUrl: './batch-text-converter.html',
})
export class BatchTextConverterTool {
  protected readonly platform = inject(PlatformService);
  private readonly jobs = inject(FsJobService);
  private readonly persistence = inject(PersistenceService);

  protected readonly bytes = formatBytes;
  protected readonly root = signal('');
  protected readonly options = this.persistence.signal<WalkOptions>(TOOL_ID, 'walkOptions', 'local', { ...DEFAULT_WALK_OPTIONS });
  protected readonly convert = this.persistence.signal<ConvertOptions>(TOOL_ID, 'convert', 'local', { ...DEFAULT_CONVERT });
  protected readonly fallbackEncoding = this.persistence.signal(TOOL_ID, 'fallbackEncoding', 'local', 'win1252');
  protected readonly inventoryJob = signal<FsJobHandle<{ files: number; binary: number }> | null>(null);
  protected readonly rows = signal<readonly InventoryRow[]>([]);
  protected readonly binary = signal(0);
  protected readonly rowFilter = signal<RowFilter>('all');
  protected readonly onlyFiltered = signal(false);
  protected readonly planJob = signal<FsJobHandle<{ preview: PlanPreview }> | null>(null);
  protected readonly preview = signal<PlanPreview | null>(null);
  protected readonly error = signal('');
  protected readonly encodings = ['utf8', 'utf16le', 'utf16be', 'win1252', 'latin1', 'iso-8859-2', 'iso-8859-15', 'win1250', 'win1251', 'shift_jis', 'euc-jp', 'gbk', 'big5', 'euc-kr', 'koi8-r'];
  protected readonly filters: readonly { id: RowFilter; label: string }[] = [
    { id: 'all', label: 'All' }, { id: 'crlf', label: 'CRLF' }, { id: 'lf', label: 'LF' }, { id: 'mixed', label: 'Mixed EOL' }, { id: 'non-utf8', label: 'Not UTF-8' },
    { id: 'bom', label: 'Has BOM' }, { id: 'no-final-newline', label: 'No final newline' }, { id: 'trailing', label: 'Trailing spaces' }, { id: 'tabs', label: 'Tab indent' },
    { id: 'spaces', label: 'Space indent' }, { id: 'mixed-indent', label: 'Mixed indent' },
  ];

  protected readonly counts = computed(() => Object.fromEntries(this.filters.map((filter) => [filter.id, this.rows().filter(ROW_FILTERS[filter.id]).length])) as Record<RowFilter, number>);
  protected readonly shownRows = computed(() => this.rows().filter(ROW_FILTERS[this.rowFilter()]));

  protected runInventory(): void {
    if (!this.root()) return;
    this.preview.set(null);
    const collected: InventoryRow[] = [];
    const job = this.jobs.run<{ files: number; binary: number }, InventoryRow>({ kind: 'text-inventory', root: this.root(), params: { options: this.options(), fallbackEncoding: this.fallbackEncoding() } }, (items) => collected.push(...items));
    this.inventoryJob.set(job);
    job.result.then((result) => { this.rows.set(collected.sort((a, b) => (a.path < b.path ? -1 : 1))); this.binary.set(result.binary); }, () => {});
  }

  protected set<K extends keyof ConvertOptions>(key: K, value: ConvertOptions[K]): void { this.convert.update((options) => ({ ...options, [key]: value })); }
  protected value(event: Event): string { return (event.target as HTMLInputElement).value; }
  protected checked(event: Event): boolean { return (event.target as HTMLInputElement).checked; }

  /** Step 1 of the contract: converted content is staged and previewed; nothing is written here. */
  protected buildPlan(): void {
    if (!this.root()) return;
    this.error.set('');
    const paths = this.onlyFiltered() && this.rows().length ? this.shownRows().map((row) => row.path) : undefined;
    const job = this.jobs.run<{ preview: PlanPreview }>({ kind: 'plan-convert', root: this.root(), params: { options: this.options(), convert: this.convert(), fallbackEncoding: this.fallbackEncoding(), ...(paths ? { paths } : {}) } });
    this.planJob.set(job);
    job.result.then((result) => this.preview.set(result.preview), (caught: Error) => this.error.set(caught.message));
  }

  protected onApplied(): void { this.preview.set(null); if (this.rows().length) this.runInventory(); }
  protected trackRow(_index: number, row: InventoryRow): string { return row.path; }
}
