import { Component, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import type { SysApplyResult, SysPlanPreview } from '../../../shared-logic/system/sys-mutation-types';
import type { ScheduledTaskDetail, ScheduledTaskSummary } from '../../../shared-logic/system/task-types';
import { PersistenceService } from '../../core/persistence/persistence.service';
import { PlatformService } from '../../core/platform/platform.service';
import { PwshStatusService } from '../../core/platform/pwsh-status.service';
import { SystemMutationService } from '../../core/platform/system-mutation.service';
import { CopyButton } from '../../shared/components/copy-button/copy-button';
import { DataTable, type DataTableColumn } from '../../shared/components/data-table/data-table';
import { DataTableCellDef } from '../../shared/components/data-table/data-table-cell.directive';
import { DesktopOnlyControl } from '../../shared/components/desktop-only-control/desktop-only-control';
import { PwshRequired } from '../../shared/components/pwsh-required/pwsh-required';
import { SplitPane } from '../../shared/components/split-pane/split-pane';
import { StatusGlyph } from '../../shared/components/status-glyph/status-glyph';
import { SystemChangePreview } from '../../shared/components/system-change-preview/system-change-preview';
import { ToolShell } from '../../shared/components/tool-shell/tool-shell';
import { filterTasks, taskFolders, taskKey, taskToggleRequest } from './scheduled-tasks-logic';

/** Windows Task Scheduler inspection and enable/disable (DUDE_PRD.md §21 Phase 31, M604). */
@Component({
  selector: 'app-scheduled-tasks',
  imports: [RouterLink, ToolShell, DesktopOnlyControl, PwshRequired, SplitPane, DataTable, DataTableCellDef, CopyButton, StatusGlyph, SystemChangePreview],
  templateUrl: './scheduled-tasks.html',
})
export class ScheduledTasksTool {
  protected readonly platform = inject(PlatformService);
  protected readonly taskKey = taskKey;
  private readonly pwsh = inject(PwshStatusService);
  private readonly persistence = inject(PersistenceService);
  private readonly mutations = inject(SystemMutationService);

  protected readonly ratio = this.persistence.signal('scheduled-tasks', 'splitRatio', 'local', 0.55);
  protected readonly tasks = signal<readonly ScheduledTaskSummary[]>([]);
  protected readonly loading = signal(false);
  protected readonly error = signal('');
  protected readonly folder = signal('\\');
  protected readonly query = signal('');
  protected readonly selectedKey = signal<string | null>(null);
  protected readonly detail = signal<ScheduledTaskDetail | null>(null);
  protected readonly detailLoading = signal(false);
  protected readonly detailError = signal('');
  protected readonly preview = signal<SysPlanPreview | null>(null);
  protected readonly planBusy = signal(false);
  protected readonly planError = signal('');

  protected readonly folders = computed(() => taskFolders(this.tasks()));
  protected readonly rows = computed(() => filterTasks(this.tasks(), this.folder(), this.query()));
  protected readonly selected = computed(() => this.tasks().find((task) => taskKey(task) === this.selectedKey()) ?? null);
  protected readonly columns: readonly DataTableColumn<ScheduledTaskSummary>[] = [
    { key: 'name', header: 'Task', value: (task) => task.taskName, sortable: true, width: 'minmax(12rem, 1.4fr)', truncate: true },
    { key: 'path', header: 'Folder', value: (task) => task.taskPath, sortable: true, width: 'minmax(10rem, 1fr)', truncate: true },
    { key: 'state', header: 'State', value: (task) => task.state, sortable: true, width: '7rem' },
    { key: 'last', header: 'Last run', value: (task) => task.lastRunTime ?? '', sortable: true, width: '10rem' },
    { key: 'next', header: 'Next run', value: (task) => task.nextRunTime ?? '', sortable: true, width: '10rem' },
    { key: 'result', header: 'Result', value: (task) => task.lastTaskResult === null ? '' : `0x${(task.lastTaskResult >>> 0).toString(16).toUpperCase()}`, sortable: true, width: '7rem' },
  ];
  protected readonly trackTask = (_: number, task: ScheduledTaskSummary): string => taskKey(task);

  constructor() { if (this.platform.isDesktop()) void this.start(); }

  private async start(): Promise<void> {
    const status = await this.pwsh.ensureLoaded();
    if (status.available) await this.refresh();
  }

  protected async refresh(): Promise<void> {
    this.loading.set(true);
    this.error.set('');
    try {
      const tasks = await window.dude.sys.taskList();
      this.tasks.set(tasks);
      const selected = this.selected();
      if (selected) await this.open(selected);
      else { this.selectedKey.set(null); this.detail.set(null); }
    } catch (caught) { this.error.set(this.message(caught)); }
    finally { this.loading.set(false); }
  }

  protected async open(task: ScheduledTaskSummary): Promise<void> {
    this.selectedKey.set(taskKey(task));
    this.detail.set(null);
    this.detailError.set('');
    this.preview.set(null);
    this.detailLoading.set(true);
    try { this.detail.set(await window.dude.sys.taskInfo(task.taskPath, task.taskName)); }
    catch (caught) { this.detailError.set(this.message(caught)); }
    finally { this.detailLoading.set(false); }
  }

  protected async previewToggle(): Promise<void> {
    const task = this.selected();
    if (!task) return;
    this.planBusy.set(true);
    this.planError.set('');
    this.preview.set(null);
    try { this.preview.set(await this.mutations.plan(taskToggleRequest(task))); }
    catch (caught) { this.planError.set(this.message(caught)); }
    finally { this.planBusy.set(false); }
  }

  protected onApplied(_result: SysApplyResult): void { this.preview.set(null); void this.refresh(); }
  protected clearPreview(): void { this.preview.set(null); }
  protected resultHex(value: number): string { return `0x${(value >>> 0).toString(16).toUpperCase().padStart(8, '0')}`; }
  protected folderName(path: string): string { return path === '\\' ? 'All tasks' : path.split('\\').filter(Boolean).at(-1) ?? path; }
  private message(caught: unknown): string { return caught instanceof Error ? caught.message : String(caught); }
}
