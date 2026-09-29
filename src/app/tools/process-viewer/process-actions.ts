import { Component, computed, effect, inject, input, output, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import type { SysApplyResult, SysPlanPreview, SysPlanRequest } from '../../../shared-logic/system/sys-mutation-types';
import type { ProcessSummary } from '../../../shared-logic/system/system-types';
import { NativeFsService } from '../../core/platform/native-fs.service';
import { SystemMutationService } from '../../core/platform/system-mutation.service';
import { StatusGlyph } from '../../shared/components/status-glyph/status-glyph';
import { SystemChangePreview } from '../../shared/components/system-change-preview/system-change-preview';
import {
  PRIORITY_CLASSES, affinityRequest, dumpFileName, dumpRequest, joinWindowsPath, priorityRequest, simpleActionRequest,
  type PriorityClass, type ProcessActionKind,
} from './process-actions-logic';

type Chooser = 'priority' | 'affinity' | 'dump' | null;

/**
 * Process actions (DUDE_PRD.md §5.2.1, Phase 31 Milestone 596). Every button only builds a plan
 * request and opens `app-system-change-preview`; changing anything requires that surface's separate
 * confirm step. Requests carry the selected instance's exact `pid` + `startKey`.
 */
@Component({
  selector: 'app-process-actions',
  imports: [RouterLink, StatusGlyph, SystemChangePreview],
  template: `
    @if (process(); as p) {
      <div class="flex flex-col gap-2 border-b border-border p-2 text-ui" data-testid="process-actions">
        <div class="flex flex-wrap items-center gap-1" role="group" aria-label="Process actions">
          <span class="text-ui-xs uppercase text-text-muted">Actions</span>
          @for (a of simpleActions; track a.kind) {
            <button type="button" class="rounded-sm border border-border px-2 py-0.5 text-text hover:bg-panel-elevated disabled:opacity-50" [disabled]="busy() || exited()" [attr.data-testid]="'action-' + a.kind" (click)="openSimple(a.kind)">{{ a.label }}</button>
          }
          <button type="button" class="rounded-sm border border-border px-2 py-0.5 text-text hover:bg-panel-elevated disabled:opacity-50" [disabled]="busy() || exited()" [class.text-accent]="chooser() === 'priority'" data-testid="action-priority" (click)="toggleChooser('priority')">Priority…</button>
          <button type="button" class="rounded-sm border border-border px-2 py-0.5 text-text hover:bg-panel-elevated disabled:opacity-50" [disabled]="busy() || exited()" [class.text-accent]="chooser() === 'affinity'" data-testid="action-affinity" (click)="toggleChooser('affinity')">Affinity…</button>
          <button type="button" class="rounded-sm border border-border px-2 py-0.5 text-text hover:bg-panel-elevated disabled:opacity-50" [disabled]="busy() || exited()" [class.text-accent]="chooser() === 'dump'" data-testid="action-dump" (click)="toggleChooser('dump')">Crash dump…</button>
          <a routerLink="/tools/system-changes" class="ml-auto text-ui-xs text-accent underline">Journal &amp; undo</a>
        </div>

        @switch (chooser()) {
          @case ('priority') {
            <div class="flex flex-wrap items-center gap-2">
              <label class="flex items-center gap-1 text-text-muted">Priority class
                <select class="rounded-sm border border-border bg-panel px-1 py-0.5 text-text" data-testid="priority-select" (change)="priority.set($any($event.target).value)">
                  @for (c of priorityClasses; track c) { <option [value]="c" [selected]="c === priority()">{{ c }}</option> }
                </select>
              </label>
              <button type="button" class="rounded-sm border border-warning px-2 py-0.5 text-warning" data-testid="priority-preview" (click)="previewPriority()">Preview…</button>
            </div>
          }
          @case ('affinity') {
            <div class="flex flex-col gap-1">
              <div class="flex flex-wrap gap-x-3 gap-y-1" role="group" aria-label="Logical processors">
                @for (cpu of cpuList(); track cpu) {
                  <label class="flex items-center gap-1 font-mono text-ui-xs text-text"><input type="checkbox" [attr.data-testid]="'cpu-' + cpu" [checked]="selectedCpus().has(cpu)" (change)="toggleCpu(cpu, $any($event.target).checked)" />CPU {{ cpu }}</label>
                }
              </div>
              <div class="flex items-center gap-2">
                <button type="button" class="rounded-sm border border-warning px-2 py-0.5 text-warning disabled:opacity-50" data-testid="affinity-preview" [disabled]="!selectedCpus().size" (click)="previewAffinity()">Preview…</button>
                <span class="text-ui-xs text-text-muted">At least one processor must stay selected.</span>
              </div>
            </div>
          }
          @case ('dump') {
            <div class="flex flex-col gap-1">
              <div class="flex flex-wrap items-center gap-3" role="radiogroup" aria-label="Dump type">
                <label class="flex items-center gap-1 text-text"><input type="radio" name="dump-type" data-testid="dump-mini" [checked]="!fullDump()" (change)="fullDump.set(false)" />Minidump</label>
                <label class="flex items-center gap-1 text-text"><input type="radio" name="dump-type" data-testid="dump-full" [checked]="fullDump()" (change)="fullDump.set(true)" />Full memory</label>
              </div>
              <div class="flex flex-wrap items-center gap-2">
                <input class="min-w-48 flex-1 rounded-sm border border-border bg-panel px-2 py-1 font-mono text-text" aria-label="Dump file path" [attr.placeholder]="'Absolute path, e.g. C:\\\\dumps\\\\' + defaultFile()" data-testid="dump-path" [value]="dumpPath()" (input)="dumpPath.set($any($event.target).value)" />
                <button type="button" class="rounded-sm border border-border px-2 py-0.5 text-text hover:bg-panel-elevated" data-testid="dump-choose" (click)="chooseFolder()">Choose folder…</button>
                <button type="button" class="rounded-sm border border-warning px-2 py-0.5 text-warning disabled:opacity-50" data-testid="dump-preview" [disabled]="!dumpPath().trim()" (click)="previewDump()">Preview…</button>
              </div>
            </div>
          }
        }

        @if (exited()) { <span class="flex items-center gap-1 text-ui-xs text-warning"><app-status-glyph kind="offline" />This process has exited; actions are disabled.</span> }
        @if (error()) { <div role="alert" class="flex items-center gap-1 text-error"><app-status-glyph kind="error" />{{ error() }}</div> }
        @if (busy()) { <div class="flex items-center gap-1 text-accent" role="status"><app-status-glyph kind="busy" />Building preview…</div> }

        <app-system-change-preview [preview]="preview()" (applied)="onApplied($event)" (discarded)="preview.set(null)" />
      </div>
    }
  `,
})
export class ProcessActions {
  private readonly mutations = inject(SystemMutationService);
  private readonly nativeFs = inject(NativeFsService);

  readonly process = input<ProcessSummary | null>(null);
  readonly exited = input(false);
  readonly logicalProcessors = input(1);
  /** Emits after a confirmed apply, so the host can refresh its list. */
  readonly applied = output<SysApplyResult>();

  protected readonly simpleActions: readonly { kind: ProcessActionKind; label: string }[] = [
    { kind: 'end', label: 'End task' }, { kind: 'end-tree', label: 'End tree' }, { kind: 'restart', label: 'Restart' },
    { kind: 'suspend', label: 'Suspend' }, { kind: 'resume', label: 'Resume' },
  ];
  protected readonly priorityClasses = PRIORITY_CLASSES;
  protected readonly chooser = signal<Chooser>(null);
  protected readonly preview = signal<SysPlanPreview | null>(null);
  protected readonly error = signal('');
  protected readonly busy = signal(false);
  protected readonly priority = signal<PriorityClass>('normal');
  protected readonly selectedCpus = signal<ReadonlySet<number>>(new Set());
  protected readonly fullDump = signal(false);
  protected readonly dumpPath = signal('');

  protected readonly cpuList = computed(() => Array.from({ length: Math.min(64, Math.max(1, this.logicalProcessors())) }, (_, i) => i));
  protected readonly defaultFile = computed(() => { const p = this.process(); return p ? dumpFileName(p) : ''; });

  /** Stable per process instance, so the periodic list refresh (new objects each tick) never resets an open preview. */
  private readonly instanceKey = computed(() => { const p = this.process(); return p ? `${p.pid}:${p.startKey}` : ''; });

  constructor() {
    // A different process instance resets every chooser and drops any open preview (which discards its plan).
    effect(() => {
      this.instanceKey();
      const cpus = this.cpuList();
      this.chooser.set(null);
      this.preview.set(null);
      this.error.set('');
      this.dumpPath.set('');
      this.selectedCpus.set(new Set(cpus));
    });
  }

  protected toggleChooser(kind: Exclude<Chooser, null>): void { this.chooser.update((c) => (c === kind ? null : kind)); }

  protected toggleCpu(cpu: number, on: boolean): void {
    this.selectedCpus.update((set) => { const next = new Set(set); if (on) next.add(cpu); else next.delete(cpu); return next; });
  }

  protected async chooseFolder(): Promise<void> {
    const p = this.process();
    if (!p) return;
    this.error.set('');
    try {
      // No native save-path dialog exists yet, so the dump goes into a folder the user grants.
      const picked = await this.nativeFs.pickDirectory();
      if (!picked.canceled) this.dumpPath.set(joinWindowsPath(picked.rootPath, dumpFileName(p)));
    } catch (caught) { this.error.set(caught instanceof Error ? caught.message : String(caught)); }
  }

  protected openSimple(action: ProcessActionKind): Promise<void> {
    const p = this.process();
    return p ? this.open(simpleActionRequest(p, action)) : Promise.resolve();
  }
  protected previewPriority(): Promise<void> {
    const p = this.process();
    return p ? this.open(priorityRequest(p, this.priority())) : Promise.resolve();
  }
  protected previewAffinity(): Promise<void> {
    const p = this.process();
    const req = p ? affinityRequest(p, this.selectedCpus()) : null;
    return req ? this.open(req) : Promise.resolve();
  }
  protected previewDump(): Promise<void> {
    const p = this.process();
    const path = this.dumpPath().trim();
    return p && path ? this.open(dumpRequest(p, path, this.fullDump())) : Promise.resolve();
  }

  /** Only asks the main process to build a plan; nothing is issued or applied here. */
  private async open(request: SysPlanRequest): Promise<void> {
    this.error.set('');
    this.busy.set(true);
    try { this.preview.set(await this.mutations.plan(request)); }
    catch (caught) { this.preview.set(null); this.error.set(caught instanceof Error ? caught.message : String(caught)); }
    finally { this.busy.set(false); }
  }

  protected onApplied(result: SysApplyResult): void { this.applied.emit(result); }
}
