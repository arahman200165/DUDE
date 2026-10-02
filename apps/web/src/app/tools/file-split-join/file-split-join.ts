import { Component, computed, inject, signal } from '@angular/core';
import type { PlanPreview } from "@dude/contracts/fs/fs-types";
import type { PartNaming, PartSet } from "@dude/tool-engine/shared/fs/split-naming";
import { partName } from "@dude/tool-engine/shared/fs/split-naming";
import { formatBytes } from "@dude/tool-engine/shared/fs/format-size";
import { ToolShell } from '../../shared/components/tool-shell/tool-shell';
import { DesktopOnlyControl } from '../../shared/components/desktop-only-control/desktop-only-control';
import { FsRootPicker, type PickedRoot } from '../../shared/components/fs-root-picker/fs-root-picker';
import { ScanProgress } from '../../shared/components/scan-progress/scan-progress';
import { MutationPreview } from '../../shared/components/mutation-preview/mutation-preview';
import { PlatformService } from '../../core/platform/platform.service';
import { PersistenceService } from '../../core/persistence/persistence.service';
import { FsJobService, type FsJobHandle } from '../../core/platform/fs-job.service';

const TOOL_ID = 'file-split-join';
type Tab = 'split' | 'join';
type SplitMode = 'size' | 'count' | 'lines';
interface DetectedSet extends PartSet { readonly total: number; readonly sidecar: boolean }
const UNITS: Readonly<Record<string, number>> = { KiB: 1024, MiB: 1024 ** 2, GiB: 1024 ** 3 };

/**
 * File Split & Join (DUDE_PRD.md §21 Phase 29 items 5 and 6, Milestone 532): split a file by size,
 * part count, or whole lines (optionally repeating a CSV header), with `.001` / `aa` / `-001.ext`
 * naming and a `.sha256` sidecar; join a detected part set back, verifying each part and the result.
 * Both are plans through the mutation engine that copy byte ranges straight from the source.
 */
@Component({
  selector: 'app-file-split-join',
  imports: [ToolShell, DesktopOnlyControl, FsRootPicker, ScanProgress, MutationPreview],
  templateUrl: './file-split-join.html',
})
export class FileSplitJoinTool {
  protected readonly platform = inject(PlatformService);
  private readonly jobs = inject(FsJobService);
  private readonly persistence = inject(PersistenceService);

  protected readonly bytes = formatBytes;
  protected readonly tab = this.persistence.signal<Tab>(TOOL_ID, 'tab', 'local', 'split');
  protected readonly error = signal('');
  protected readonly preview = signal<PlanPreview | null>(null);
  protected readonly planJob = signal<FsJobHandle<{ preview: PlanPreview }> | null>(null);

  // ---- Split ----
  protected readonly source = signal('');
  protected readonly sourceInfo = signal<PickedRoot | null>(null);
  protected readonly splitOutput = signal('');
  protected readonly mode = this.persistence.signal<SplitMode>(TOOL_ID, 'mode', 'local', 'size');
  protected readonly partSize = this.persistence.signal(TOOL_ID, 'partSize', 'local', 100);
  protected readonly unit = this.persistence.signal(TOOL_ID, 'unit', 'local', 'MiB');
  protected readonly parts = this.persistence.signal(TOOL_ID, 'parts', 'local', 4);
  protected readonly linesPerPart = this.persistence.signal(TOOL_ID, 'linesPerPart', 'local', 100_000);
  protected readonly repeatHeader = this.persistence.signal(TOOL_ID, 'repeatHeader', 'local', true);
  protected readonly naming = this.persistence.signal<PartNaming>(TOOL_ID, 'naming', 'local', 'numeric');
  protected readonly sidecar = this.persistence.signal(TOOL_ID, 'sidecar', 'local', true);
  protected readonly units = Object.keys(UNITS);
  protected readonly estimate = computed(() => {
    const info = this.sourceInfo();
    if (!info?.size) return '';
    const count = this.mode() === 'count' ? Math.max(1, this.parts()) : this.mode() === 'size' ? Math.ceil(info.size / Math.max(1, this.partSize() * UNITS[this.unit()])) : 0;
    const name = info.name;
    return count ? `${count} part(s): ${partName(name, 0, this.naming())} … ${partName(name, count - 1, this.naming(), Math.max(3, String(count).length))}` : `${partName(name, 0, this.naming())}, ${partName(name, 1, this.naming())}, …`;
  });

  // ---- Join ----
  protected readonly partsFolder = signal('');
  protected readonly joinOutput = signal('');
  protected readonly detectJob = signal<FsJobHandle<{ sets: DetectedSet[] }> | null>(null);
  protected readonly sets = signal<readonly DetectedSet[]>([]);
  protected readonly chosen = signal('');
  protected readonly outputName = signal('');
  protected readonly verify = signal(true);
  protected readonly allowGaps = signal(false);
  protected readonly chosenSet = computed(() => this.sets().find((set) => set.base === this.chosen()) ?? null);

  protected pickedSource(root: PickedRoot): void { this.sourceInfo.set(root); }

  protected previewSplit(): void {
    if (!this.source() || !this.splitOutput()) return;
    this.error.set('');
    this.preview.set(null);
    const params = { outputRoot: this.splitOutput(), mode: this.mode(), partSize: Math.round(this.partSize() * UNITS[this.unit()]), parts: this.parts(), linesPerPart: this.linesPerPart(), repeatHeader: this.repeatHeader(), naming: this.naming(), sidecar: this.sidecar() };
    this.run({ kind: 'plan-split', root: this.source(), params });
  }

  protected findSets(): void {
    if (!this.partsFolder()) return;
    this.error.set('');
    const job = this.jobs.run<{ sets: DetectedSet[] }>({ kind: 'detect-parts', root: this.partsFolder() });
    this.detectJob.set(job);
    job.result.then((result) => {
      this.sets.set(result.sets);
      if (result.sets.length) this.choose(result.sets[0].base);
      if (!this.joinOutput()) this.joinOutput.set(this.partsFolder());
    }, () => {});
  }

  protected choose(base: string): void { this.chosen.set(base); this.outputName.set(base); }

  protected previewJoin(): void {
    const set = this.chosenSet();
    if (!set || !this.joinOutput()) return;
    this.error.set('');
    this.preview.set(null);
    this.run({ kind: 'plan-join', root: this.partsFolder(), params: { base: set.base, outputRoot: this.joinOutput(), outputName: this.outputName(), verify: this.verify(), allowGaps: this.allowGaps() } });
  }

  /** Step 1 of the contract for both directions: the plan is built and shown; nothing is written. */
  private run(request: { kind: string; root: string; params: Record<string, unknown> }): void {
    const job = this.jobs.run<{ preview: PlanPreview }>(request);
    this.planJob.set(job);
    job.result.then((result) => this.preview.set(result.preview), (caught: Error) => this.error.set(caught.message));
  }

  protected value(event: Event): string { return (event.target as HTMLInputElement).value; }
  protected checked(event: Event): boolean { return (event.target as HTMLInputElement).checked; }
}
