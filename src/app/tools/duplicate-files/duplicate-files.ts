import { Component, computed, inject, signal } from '@angular/core';
import type { PlanPreview, WalkOptions } from '../../../shared-logic/fs/fs-types';
import { DEFAULT_WALK_OPTIONS } from '../../../shared-logic/fs/walk-filter';
import { formatBytes } from '../../../shared-logic/fs/format-size';
import { DEFAULT_NORMALIZE, type NormalizeOptions } from '../../../shared-logic/fs/text-normalize';
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
import { groupsToCsv, KEEP_RULES, selectByRule, trashCandidates, type DuplicateGroup, type KeepRule } from './duplicate-rules';

const TOOL_ID = 'duplicate-files';
const PAGE = 200;
type Mode = 'exact' | 'content';
interface DuplicatesResult { readonly mode: Mode; readonly scannedFiles: number; readonly groups: readonly DuplicateGroup[]; readonly duplicateFiles: number; readonly wasted: number }

/**
 * Duplicate Files (DUDE_PRD.md §21 Phase 29 items 2 and 17, Milestone 528): byte-identical
 * duplicates across any granted folder or drive (size → head/tail fingerprint → SHA-256, optional
 * byte-for-byte confirm), plus "duplicate content" groups of text files that differ only in line
 * endings, whitespace, or BOM. Removing extras is always a Recycle Bin plan through the mutation
 * engine, and a selection that would remove every copy of a file is refused.
 */
@Component({
  selector: 'app-duplicate-files',
  imports: [ToolShell, DesktopOnlyControl, FsRootPicker, WalkOptionsPanel, ScanProgress, MutationPreview],
  templateUrl: './duplicate-files.html',
})
export class DuplicateFilesTool {
  protected readonly platform = inject(PlatformService);
  private readonly jobs = inject(FsJobService);
  private readonly mutations = inject(FsMutationService);
  private readonly persistence = inject(PersistenceService);

  protected readonly root = signal('');
  protected readonly options = this.persistence.signal<WalkOptions>(TOOL_ID, 'walkOptions', 'local', { ...DEFAULT_WALK_OPTIONS, useGitignore: false });
  protected readonly mode = this.persistence.signal<Mode>(TOOL_ID, 'mode', 'local', 'exact');
  protected readonly minSize = this.persistence.signal<number>(TOOL_ID, 'minSize', 'local', 1);
  protected readonly byteCompare = this.persistence.signal<boolean>(TOOL_ID, 'byteCompare', 'local', false);
  protected readonly normalize = this.persistence.signal<NormalizeOptions>(TOOL_ID, 'normalize', 'local', { ...DEFAULT_NORMALIZE });
  protected readonly rule = this.persistence.signal<KeepRule>(TOOL_ID, 'rule', 'local', 'oldest');
  protected readonly ruleFolder = signal('');
  protected readonly job = signal<FsJobHandle<DuplicatesResult> | null>(null);
  protected readonly result = signal<DuplicatesResult | null>(null);
  protected readonly selected = signal<ReadonlySet<string>>(new Set());
  protected readonly shown = signal(PAGE);
  protected readonly preview = signal<PlanPreview | null>(null);
  protected readonly error = signal('');
  protected readonly rules = KEEP_RULES;
  protected readonly bytes = formatBytes;

  protected readonly groups = computed(() => this.result()?.groups ?? []);
  protected readonly visibleGroups = computed(() => this.groups().slice(0, this.shown()));
  protected readonly selection = computed(() => {
    try { return { ...trashCandidates(this.groups(), this.selected()), problem: '' }; }
    catch (caught) { return { paths: [] as string[], bytes: 0, problem: caught instanceof Error ? caught.message : String(caught) }; }
  });

  protected find(): void {
    if (!this.root()) return;
    this.preview.set(null);
    this.selected.set(new Set());
    this.shown.set(PAGE);
    const job = this.jobs.run<DuplicatesResult>({ kind: 'duplicates', root: this.root(), params: { options: this.options(), mode: this.mode(), minSize: this.minSize(), byteCompare: this.byteCompare(), normalize: this.normalize() } });
    this.job.set(job);
    job.result.then((value) => this.result.set(value), () => {});
  }

  protected applyRule(): void { this.selected.set(selectByRule(this.groups(), this.rule(), this.ruleFolder())); }
  protected clearSelection(): void { this.selected.set(new Set()); }

  protected toggle(path: string, event: Event): void {
    const checked = (event.target as HTMLInputElement).checked;
    this.selected.update((current) => { const next = new Set(current); if (checked) next.add(path); else next.delete(path); return next; });
  }

  protected setNormalize(key: keyof NormalizeOptions, event: Event): void {
    this.normalize.update((value) => ({ ...value, [key]: (event.target as HTMLInputElement).checked }));
  }

  /** Step 1 of the contract: a Recycle Bin plan for review. Nothing is removed here. */
  protected async previewTrash(): Promise<void> {
    const selection = this.selection();
    if (!selection.paths.length || selection.problem) return;
    this.error.set('');
    try { this.preview.set(await this.mutations.planTrash(this.root(), selection.paths, TOOL_ID, `Recycle ${selection.paths.length} duplicate(s) (${formatBytes(selection.bytes)})`)); }
    catch (caught) { this.error.set(caught instanceof Error ? caught.message : String(caught)); }
  }

  protected onApplied(): void {
    const removed = new Set(this.selection().paths);
    const result = this.result();
    if (result) {
      const groups = result.groups.map((group) => ({ ...group, files: group.files.filter((file) => !removed.has(file.path)) })).filter((group) => group.files.length > 1);
      this.result.set({ ...result, groups });
    }
    this.clearSelection();
  }

  protected exportCsv(): void { downloadFile(new Blob([groupsToCsv(this.groups())], { type: 'text/csv' }), 'duplicates.csv'); }
  protected checked(event: Event): boolean { return (event.target as HTMLInputElement).checked; }
  protected date(mtimeMs: number): string { return new Date(mtimeMs).toISOString().slice(0, 16).replace('T', ' '); }
}
