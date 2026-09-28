import { Component, computed, signal } from '@angular/core';
import { ToolShell } from '../../shared/components/tool-shell/tool-shell';
import { FileDrop } from '../../shared/components/file-drop/file-drop';
import { BusyIndicator, BusyIndicatorStatus } from '../../shared/components/busy-indicator/busy-indicator';
import { ErrorPanel } from '../../shared/components/error-panel/error-panel';
import { WorkbenchTable } from '../../shared/components/workbench-table/workbench-table';
import { SimpleColumnsPipe } from '../../shared/components/workbench-table/simple-columns.pipe';
import { inspectSqlite, SqliteInspectResult } from './sqlite-inspect';

@Component({
  selector: 'app-sqlite-viewer',
  imports: [ToolShell, FileDrop, BusyIndicator, ErrorPanel, WorkbenchTable, SimpleColumnsPipe],
  templateUrl: './sqlite-viewer.html',
})
export class SqliteViewer {
  protected readonly fileName = signal<string | null>(null);
  protected readonly result = signal<SqliteInspectResult | null>(null);
  protected readonly status = signal<BusyIndicatorStatus>('idle');
  protected readonly selectedTable = signal<string | null>(null);

  protected readonly errorMessage = computed(() => {
    const current = this.result();
    return current && !current.ok ? current.error.message : null;
  });

  protected readonly tables = computed(() => {
    const current = this.result();
    return current?.ok ? current.tables : [];
  });

  protected readonly activeTable = computed(() => {
    const tables = this.tables();
    if (tables.length === 0) return null;
    return tables.find((table) => table.name === this.selectedTable()) ?? tables[0];
  });

  protected async onFileSelected(file: File): Promise<void> {
    this.fileName.set(file.name);
    this.selectedTable.set(null);
    this.status.set('running');
    const buffer = await file.arrayBuffer();
    const result = await inspectSqlite(new Uint8Array(buffer));
    this.result.set(result);
    this.status.set(result.ok ? 'done' : 'error');
  }

  protected onRejected(message: string): void {
    this.fileName.set(null);
    this.result.set({ ok: false, error: { message } });
    this.status.set('error');
  }

  protected selectTable(name: string): void {
    this.selectedTable.set(name);
  }
}
