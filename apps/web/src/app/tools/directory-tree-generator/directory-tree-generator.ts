import { Component, computed, inject, signal } from '@angular/core';
import type { PlanPreview, WalkEntry, WalkOptions } from "@dude/contracts/fs/fs-types";
import { DEFAULT_WALK_OPTIONS } from "@dude/tool-engine/shared/fs/walk-filter";
import { ToolShell } from '../../shared/components/tool-shell/tool-shell';
import { DesktopOnlyControl } from '../../shared/components/desktop-only-control/desktop-only-control';
import { FsRootPicker, type PickedRoot } from '../../shared/components/fs-root-picker/fs-root-picker';
import { WalkOptionsPanel } from '../../shared/components/walk-options/walk-options';
import { ScanProgress } from '../../shared/components/scan-progress/scan-progress';
import { MutationPreview } from '../../shared/components/mutation-preview/mutation-preview';
import { CopyButton } from '../../shared/components/copy-button/copy-button';
import { SaveTextFile } from '../../shared/components/save-text-file/save-text-file';
import { PlatformService } from '../../core/platform/platform.service';
import { PersistenceService } from '../../core/persistence/persistence.service';
import { FsJobService, type FsJobHandle } from '../../core/platform/fs-job.service';
import { FsMutationService } from '../../core/platform/fs-mutation.service';
import { buildTree, DEFAULT_TREE_OPTIONS, FORMAT_EXTENSIONS, renderTree, type TreeFormat, type TreeNode, type TreeRenderOptions } from "@dude/tool-engine/tools/directory-tree-generator/tree-format";

const TOOL_ID = 'directory-tree-generator';
const MAX_ENTRIES = 500_000;
const PREVIEW_LINES = 4000;

/**
 * Directory Tree Generator (DUDE_PRD.md §21 Phase 29 item 4, Milestone 526): a `tree`-style listing
 * of any granted folder (not just a one-shot picked snapshot), re-generated on demand, in seven
 * formats. Writing the result into the folder itself goes through the mutation engine's preview →
 * confirm path; copy and Save As never touch the tree.
 */
@Component({
  selector: 'app-directory-tree-generator',
  imports: [ToolShell, DesktopOnlyControl, FsRootPicker, WalkOptionsPanel, ScanProgress, MutationPreview, CopyButton, SaveTextFile],
  templateUrl: './directory-tree-generator.html',
})
export class DirectoryTreeGeneratorTool {
  protected readonly platform = inject(PlatformService);
  private readonly jobs = inject(FsJobService);
  private readonly mutations = inject(FsMutationService);
  private readonly persistence = inject(PersistenceService);

  protected readonly root = signal('');
  protected readonly rootName = signal('.');
  protected readonly options = this.persistence.signal<WalkOptions>(TOOL_ID, 'walkOptions', 'local', { ...DEFAULT_WALK_OPTIONS });
  protected readonly render = this.persistence.signal<Omit<TreeRenderOptions, 'rootName'>>(TOOL_ID, 'render', 'local', { ...DEFAULT_TREE_OPTIONS });
  protected readonly job = signal<FsJobHandle<unknown> | null>(null);
  protected readonly tree = signal<TreeNode | null>(null);
  protected readonly truncated = signal(false);
  protected readonly outputName = signal('');
  protected readonly preview = signal<PlanPreview | null>(null);
  protected readonly error = signal('');
  protected readonly formats: readonly { id: TreeFormat; label: string }[] = [
    { id: 'unicode', label: 'Tree (Unicode)' }, { id: 'ascii', label: 'Tree (ASCII)' }, { id: 'markdown', label: 'Markdown list' },
    { id: 'json', label: 'JSON' }, { id: 'html', label: 'HTML (collapsible)' }, { id: 'mermaid', label: 'Mermaid mindmap' }, { id: 'plantuml', label: 'PlantUML mindmap' },
  ];

  protected readonly text = computed(() => {
    const tree = this.tree();
    return tree ? renderTree(tree, { ...this.render(), rootName: this.rootName() }) : '';
  });
  protected readonly shownText = computed(() => {
    const lines = this.text().split('\n');
    return lines.length > PREVIEW_LINES ? `${lines.slice(0, PREVIEW_LINES).join('\n')}\n… ${lines.length - PREVIEW_LINES} more line(s) — copy or save for the full output` : this.text();
  });
  protected readonly extension = computed(() => FORMAT_EXTENSIONS[this.render().format]);
  protected readonly fileName = computed(() => this.outputName().trim() || `TREE${this.extension()}`);

  protected picked(root: PickedRoot): void { this.rootName.set(root.name || '.'); }

  protected generate(): void {
    if (!this.root()) return;
    this.preview.set(null);
    this.truncated.set(false);
    const entries: WalkEntry[] = [];
    const job = this.jobs.run<unknown, WalkEntry>({ kind: 'walk', root: this.root(), params: { options: this.options(), includeDirs: true } }, (items) => {
      if (entries.length >= MAX_ENTRIES) { this.truncated.set(true); return; }
      entries.push(...items.slice(0, MAX_ENTRIES - entries.length));
    });
    this.job.set(job);
    job.result.then(() => this.tree.set(buildTree(entries, this.rootName())), () => {});
  }

  protected setRender<K extends keyof Omit<TreeRenderOptions, 'rootName'>>(key: K, value: TreeRenderOptions[K]): void {
    this.render.update((current) => ({ ...current, [key]: value }));
  }

  protected checked(event: Event): boolean { return (event.target as HTMLInputElement).checked; }

  /** Step 1 of the contract: stage the file and show the plan. Nothing is written here. */
  protected async previewWrite(): Promise<void> {
    this.error.set('');
    try { this.preview.set(await this.mutations.planWriteText(this.root(), this.fileName(), this.text(), TOOL_ID)); }
    catch (caught) { this.error.set(caught instanceof Error ? caught.message : String(caught)); }
  }
}
