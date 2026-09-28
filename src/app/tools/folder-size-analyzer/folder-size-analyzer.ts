import { Component, computed, inject, signal } from '@angular/core';
import { ScrollingModule } from '@angular/cdk/scrolling';
import type { PlanPreview, WalkOptions } from '../../../shared-logic/fs/fs-types';
import { DEFAULT_WALK_OPTIONS } from '../../../shared-logic/fs/walk-filter';
import { formatBytes } from '../../../shared-logic/fs/format-size';
import type { SizeReport } from '../../../shared-logic/fs/size-aggregate';
import { ToolShell } from '../../shared/components/tool-shell/tool-shell';
import { DesktopOnlyControl } from '../../shared/components/desktop-only-control/desktop-only-control';
import { FsRootPicker } from '../../shared/components/fs-root-picker/fs-root-picker';
import { WalkOptionsPanel } from '../../shared/components/walk-options/walk-options';
import { ScanProgress } from '../../shared/components/scan-progress/scan-progress';
import { MutationPreview } from '../../shared/components/mutation-preview/mutation-preview';
import { PlatformService } from '../../core/platform/platform.service';
import { PersistenceService } from '../../core/persistence/persistence.service';
import { FsJobService, type FsJobHandle } from '../../core/platform/fs-job.service';
import { FsMutationService } from '../../core/platform/fs-mutation.service';
import { downloadFile } from '../../shared/utils/download-file';
import { buildTree, nameOf, normalizeSelection, parentPath, reportToCsv, squarify, treemapItems, visibleRows, type SizeSort, type SizeRow } from './folder-size-logic';

const TOOL_ID = 'folder-size-analyzer';
const MAP_WIDTH = 960;
const MAP_HEIGHT = 420;
type View = 'tree' | 'treemap' | 'largest' | 'extensions' | 'age';

interface FolderSizeResult { readonly report: SizeReport; readonly scannedAt: string }

/**
 * Folder Size Analyzer (DUDE_PRD.md §21 Phase 29 item 1, Milestone 525): recursive, drive-capable
 * size breakdown of any granted folder — a TreeSize-style tree, a squarified treemap, top files,
 * and by-extension/by-age breakdowns. Cleaning up is a Recycle Bin plan through the shared
 * mutation engine: selecting and previewing never deletes anything.
 */
@Component({
  selector: 'app-folder-size-analyzer',
  imports: [ToolShell, DesktopOnlyControl, FsRootPicker, WalkOptionsPanel, ScanProgress, MutationPreview, ScrollingModule],
  templateUrl: './folder-size-analyzer.html',
})
export class FolderSizeAnalyzerTool {
  protected readonly platform = inject(PlatformService);
  private readonly jobs = inject(FsJobService);
  private readonly mutations = inject(FsMutationService);
  private readonly persistence = inject(PersistenceService);

  protected readonly root = signal('');
  protected readonly options = this.persistence.signal<WalkOptions>(TOOL_ID, 'walkOptions', 'local', { ...DEFAULT_WALK_OPTIONS, useGitignore: false });
  protected readonly sort = this.persistence.signal<SizeSort>(TOOL_ID, 'sort', 'local', 'size');
  protected readonly view = this.persistence.signal<View>(TOOL_ID, 'view', 'local', 'tree');
  protected readonly job = signal<FsJobHandle<FolderSizeResult> | null>(null);
  protected readonly result = signal<FolderSizeResult | null>(null);
  protected readonly expanded = signal<ReadonlySet<string>>(new Set());
  protected readonly focus = signal('');
  protected readonly selected = signal<ReadonlySet<string>>(new Set());
  protected readonly preview = signal<PlanPreview | null>(null);
  protected readonly error = signal('');
  protected readonly bytes = formatBytes;
  protected readonly nameOf = nameOf;
  protected readonly mapWidth = MAP_WIDTH;
  protected readonly mapHeight = MAP_HEIGHT;
  protected readonly views: readonly { id: View; label: string }[] = [
    { id: 'tree', label: 'Tree' }, { id: 'treemap', label: 'Treemap' }, { id: 'largest', label: 'Largest files' },
    { id: 'extensions', label: 'By extension' }, { id: 'age', label: 'By age' },
  ];

  protected readonly report = computed(() => this.result()?.report ?? null);
  protected readonly tree = computed(() => { const report = this.report(); return report ? buildTree(report) : null; });
  protected readonly rows = computed<SizeRow[]>(() => { const tree = this.tree(); return tree ? visibleRows(tree, this.expanded(), this.sort()) : []; });
  protected readonly rootNode = computed(() => this.tree()?.byPath.get('') ?? null);
  protected readonly breadcrumb = computed(() => {
    const parts = this.focus() ? this.focus().split('/') : [];
    return [{ path: '', label: nameOf('') }, ...parts.map((part, index) => ({ path: parts.slice(0, index + 1).join('/'), label: part }))];
  });
  protected readonly treemap = computed(() => {
    const tree = this.tree();
    if (!tree) return [];
    const items = treemapItems(tree, this.focus());
    const labels = new Map(items.map((item) => [item.key, item]));
    return squarify(items, 0, 0, MAP_WIDTH, MAP_HEIGHT).map((rect, index) => ({ ...rect, label: labels.get(rect.key)!.label, folder: labels.get(rect.key)!.folder, hue: (index * 47) % 360 }));
  });
  protected readonly selection = computed(() => normalizeSelection(this.selected()));
  protected readonly maxExtension = computed(() => Math.max(1, ...(this.report()?.byExtension ?? []).map((bucket) => bucket.bytes)));
  protected readonly maxAge = computed(() => Math.max(1, ...(this.report()?.byAge ?? []).map((bucket) => bucket.bytes)));

  protected scan(): void {
    if (!this.root()) return;
    this.error.set('');
    this.preview.set(null);
    this.selected.set(new Set());
    const job = this.jobs.run<FolderSizeResult>({ kind: 'folder-size', root: this.root(), params: { options: this.options() } });
    this.job.set(job);
    job.result.then((value) => {
      this.result.set(value);
      this.expanded.set(new Set());
      this.focus.set('');
    }, () => {});
  }

  protected toggleExpand(path: string): void {
    this.expanded.update((current) => {
      const next = new Set(current);
      if (next.has(path)) next.delete(path); else next.add(path);
      return next;
    });
  }

  protected toggleSelect(path: string, event: Event): void {
    const checked = (event.target as HTMLInputElement).checked;
    this.selected.update((current) => {
      const next = new Set(current);
      if (checked) next.add(path); else next.delete(path);
      return next;
    });
  }

  protected drill(key: string, folder: boolean): void {
    if (folder && this.tree()?.children.get(key)?.length) this.focus.set(key);
    else if (folder) this.focus.set(parentPath(key) === this.focus() ? this.focus() : parentPath(key));
  }

  /** Step 1 of the contract: builds a Recycle Bin plan for review. Nothing is deleted here. */
  protected async previewTrash(): Promise<void> {
    if (!this.selection().length) return;
    this.error.set('');
    try {
      this.preview.set(await this.mutations.planTrash(this.root(), this.selection(), TOOL_ID, `Recycle ${this.selection().length} item(s) from ${nameOf(this.root().replace(/\\/g, '/'))}`));
    } catch (caught) { this.error.set(caught instanceof Error ? caught.message : String(caught)); }
  }

  protected onApplied(): void { this.clearSelection(); }
  protected clearSelection(): void { this.selected.set(new Set()); }
  protected trackRow(_index: number, row: SizeRow): string { return row.node.path; }

  protected exportCsv(): void {
    const report = this.report();
    if (report) downloadFile(new Blob([reportToCsv(report)], { type: 'text/csv' }), 'folder-sizes.csv');
  }

  protected exportJson(): void {
    const result = this.result();
    if (result) downloadFile(new Blob([JSON.stringify({ root: this.root(), ...result }, null, 2)], { type: 'application/json' }), 'folder-sizes.json');
  }

  protected percent(share: number): string { return `${Math.max(0.5, Math.round(share * 1000) / 10)}%`; }
  protected ageDate(mtimeMs: number): string { return new Date(mtimeMs).toISOString().slice(0, 10); }
}
