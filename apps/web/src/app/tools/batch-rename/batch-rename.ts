import { BatchRenameTool_statusClass, BatchRenameTool_trackProposal } from "@dude/tool-engine/tools/batch-rename/batch-rename.embedded-engine";
import { Component, computed, inject, signal } from '@angular/core';
import { ScrollingModule } from '@angular/cdk/scrolling';
import type { PlanPreview, WalkEntry, WalkOptions } from "@dude/contracts/fs/fs-types";
import { DEFAULT_WALK_OPTIONS } from "@dude/tool-engine/shared/fs/walk-filter";
import { computeRenames, DEFAULT_RENAME, type RenameOptions, type RenameProposal } from "@dude/tool-engine/shared/fs/rename-pattern";
import { ToolShell } from '../../shared/components/tool-shell/tool-shell';
import { DesktopOnlyControl } from '../../shared/components/desktop-only-control/desktop-only-control';
import { FsRootPicker } from '../../shared/components/fs-root-picker/fs-root-picker';
import { WalkOptionsPanel } from '../../shared/components/walk-options/walk-options';
import { ScanProgress } from '../../shared/components/scan-progress/scan-progress';
import { MutationPreview } from '../../shared/components/mutation-preview/mutation-preview';
import { PlatformService } from '../../core/platform/platform.service';
import { PersistenceService } from '../../core/persistence/persistence.service';
import { FsJobService, type FsJobHandle } from '../../core/platform/fs-job.service';

const TOOL_ID = 'batch-rename';
const MAX_ITEMS = 200_000;
interface Scope { readonly files: boolean; readonly dirs: boolean; readonly recursive: boolean }

/**
 * Batch Rename (DUDE_PRD.md §21 Phase 29 item 3, Milestone 530): pattern-based renaming across a
 * granted folder — find/replace (literal or regex with groups), tokens (counter, parent, dates,
 * size, content hash), case transforms, or an explicit old→new list — with a live preview that
 * flags invalid Windows names, collisions and clashes. Applying is a rename plan through the
 * mutation engine (swaps, chains and case-only renames are safe; everything is undoable).
 */
@Component({
  selector: 'app-batch-rename',
  imports: [ToolShell, DesktopOnlyControl, FsRootPicker, WalkOptionsPanel, ScanProgress, MutationPreview, ScrollingModule],
  templateUrl: './batch-rename.html',
})
export class BatchRenameTool {
  protected readonly platform = inject(PlatformService);
  private readonly jobs = inject(FsJobService);
  private readonly persistence = inject(PersistenceService);

  protected readonly root = signal('');
  protected readonly options = this.persistence.signal<WalkOptions>(TOOL_ID, 'walkOptions', 'local', { ...DEFAULT_WALK_OPTIONS });
  protected readonly scope = this.persistence.signal<Scope>(TOOL_ID, 'scope', 'local', { files: true, dirs: false, recursive: false });
  protected readonly rename = this.persistence.signal<RenameOptions>(TOOL_ID, 'rename', 'local', { ...DEFAULT_RENAME });
  protected readonly loadJob = signal<FsJobHandle<unknown> | null>(null);
  protected readonly entries = signal<readonly WalkEntry[]>([]);
  protected readonly loaded = signal(false);
  protected readonly excluded = signal<ReadonlySet<string>>(new Set());
  protected readonly filter = signal<'changes' | 'problems' | 'all'>('changes');
  protected readonly planJob = signal<FsJobHandle<{ preview: PlanPreview }> | null>(null);
  protected readonly preview = signal<PlanPreview | null>(null);
  protected readonly error = signal('');
  protected readonly tokens = ['{name}', '{.ext}', '{ext}', '{n}', '{n:000}', '{parent}', '{mtime:yyyy-MM-dd}', '{size}', '{hash8}'];

  private readonly scoped = computed(() => {
    const scope = this.scope();
    return this.entries().filter((entry) => (entry.kind === 'file' && scope.files) || (entry.kind === 'dir' && scope.dirs));
  });
  private readonly existing = computed(() => {
    const map = new Map<string, Set<string>>();
    for (const entry of this.entries()) {
      const folder = entry.path.includes('/') ? entry.path.slice(0, entry.path.lastIndexOf('/')) : '';
      if (!map.has(folder)) map.set(folder, new Set());
      map.get(folder)!.add(entry.path.slice(entry.path.lastIndexOf('/') + 1).toLowerCase());
    }
    return map;
  });
  protected readonly result = computed<{ proposals: RenameProposal[]; problem: string }>(() => {
    try {
      const entries = this.scoped().filter((entry): entry is WalkEntry & { kind: 'file' | 'dir' } => entry.kind !== 'link');
      return { proposals: computeRenames(entries.map((entry) => ({ path: entry.path, kind: entry.kind, size: entry.size, mtimeMs: entry.mtimeMs })), this.rename(), this.existing()), problem: '' };
    } catch (caught) { return { proposals: [], problem: caught instanceof Error ? caught.message : String(caught) }; }
  });
  protected readonly counts = computed(() => {
    const counts = { rename: 0, unchanged: 0, invalid: 0, collision: 0, exists: 0 };
    for (const proposal of this.result().proposals) counts[proposal.status]++;
    return counts;
  });
  protected readonly visible = computed(() => {
    const filter = this.filter();
    return this.result().proposals.filter((proposal) => filter === 'all' || (filter === 'problems' ? proposal.status !== 'rename' && proposal.status !== 'unchanged' : proposal.status !== 'unchanged'));
  });
  protected readonly included = computed(() => this.result().proposals.filter((proposal) => proposal.status === 'rename' && !this.excluded().has(proposal.path)));

  protected load(keepPreview = false): void {
    if (!this.root()) return;
    if (!keepPreview) this.preview.set(null);
    this.excluded.set(new Set());
    const collected: WalkEntry[] = [];
    const walk = { ...this.options(), maxDepth: this.scope().recursive ? this.options().maxDepth : 0 };
    const job = this.jobs.run<unknown, WalkEntry>({ kind: 'walk', root: this.root(), params: { options: walk, includeDirs: true } }, (items) => { if (collected.length < MAX_ITEMS) collected.push(...items); });
    this.loadJob.set(job);
    job.result.then(() => { this.entries.set(collected); this.loaded.set(true); }, () => {});
  }

  protected setScope(key: keyof Scope, event: Event): void {
    this.scope.update((scope) => ({ ...scope, [key]: (event.target as HTMLInputElement).checked }));
    if (key === 'recursive' && this.loaded()) this.load();
  }

  protected set<K extends keyof RenameOptions>(key: K, value: RenameOptions[K]): void { this.rename.update((options) => ({ ...options, [key]: value })); }
  protected text(event: Event): string { return (event.target as HTMLInputElement).value; }
  protected checked(event: Event): boolean { return (event.target as HTMLInputElement).checked; }
  protected addToken(token: string): void { this.set('template', `${this.rename().template}${token}`); }

  protected toggle(path: string, event: Event): void {
    const include = (event.target as HTMLInputElement).checked;
    this.excluded.update((current) => { const next = new Set(current); if (include) next.delete(path); else next.add(path); return next; });
  }

  protected async loadList(event: Event): Promise<void> {
    const file = (event.target as HTMLInputElement).files?.[0];
    if (file) this.set('list', await file.text());
  }

  /** Seeds list mode with `path -> name` lines for every scoped item, ready to edit. */
  protected seedList(): void {
    this.set('list', this.scoped().filter((entry) => entry.kind !== 'link').map((entry) => `${entry.path} -> ${entry.path.slice(entry.path.lastIndexOf('/') + 1)}`).join('\n'));
    this.set('mode', 'list');
  }

  /** Step 1 of the contract: the worker rebuilds the plan authoritatively. Nothing is renamed here. */
  protected buildPlan(): void {
    const paths = this.included().map((proposal) => proposal.path);
    if (!paths.length) return;
    this.error.set('');
    const job = this.jobs.run<{ preview: PlanPreview }>({ kind: 'plan-rename', root: this.root(), params: { options: this.options(), scope: this.scope(), rename: this.rename(), paths } });
    this.planJob.set(job);
    job.result.then((result) => this.preview.set(result.preview), (caught: Error) => this.error.set(caught.message));
  }

  /** Keeps the applied preview (and its outcome) visible while the item list refreshes. */
  protected onApplied(): void { this.load(true); }
  protected statusClass = BatchRenameTool_statusClass;

  protected trackProposal = BatchRenameTool_trackProposal;

}
