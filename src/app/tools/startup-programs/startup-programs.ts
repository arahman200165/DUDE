import { Component, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import type { SysApplyResult, SysPlanPreview } from '../../../shared-logic/system/sys-mutation-types';
import type { StartupEntry, StartupProgramsResult } from '../../../shared-logic/system/startup-types';
import { PlatformService } from '../../core/platform/platform.service';
import { SystemMutationService } from '../../core/platform/system-mutation.service';
import { DataTable, type DataTableColumn } from '../../shared/components/data-table/data-table';
import { DataTableCellDef } from '../../shared/components/data-table/data-table-cell.directive';
import { DesktopOnlyControl } from '../../shared/components/desktop-only-control/desktop-only-control';
import { StatusGlyph } from '../../shared/components/status-glyph/status-glyph';
import { SystemChangePreview } from '../../shared/components/system-change-preview/system-change-preview';
import { ToolShell } from '../../shared/components/tool-shell/tool-shell';
import { filterStartupEntries, startupToggleRequest, type StartupFilter } from './startup-programs-logic';

/** Windows startup registrations and their supported Task Manager enable/disable controls (M605). */
@Component({
  selector: 'app-startup-programs',
  imports: [RouterLink, ToolShell, DesktopOnlyControl, DataTable, DataTableCellDef, StatusGlyph, SystemChangePreview],
  templateUrl: './startup-programs.html',
})
export class StartupProgramsTool {
  protected readonly platform = inject(PlatformService);
  private readonly mutations = inject(SystemMutationService);
  protected readonly entries = signal<readonly StartupEntry[]>([]);
  protected readonly warnings = signal<readonly string[]>([]);
  protected readonly loading = signal(false);
  protected readonly error = signal('');
  protected readonly query = signal('');
  protected readonly source = signal<StartupFilter>('all');
  protected readonly state = signal('all');
  protected readonly selectedId = signal<string | null>(null);
  protected readonly preview = signal<SysPlanPreview | null>(null);
  protected readonly planning = signal(false);
  protected readonly planError = signal('');
  protected readonly rows = computed(() => filterStartupEntries(this.entries(), this.query(), this.source(), this.state()));
  protected readonly selected = computed(() => this.entries().find((entry) => entry.id === this.selectedId()) ?? null);
  protected readonly columns: readonly DataTableColumn<StartupEntry>[] = [
    { key: 'name', header: 'Name', value: (entry) => entry.name, sortable: true, width: 'minmax(10rem, 1.2fr)', truncate: true },
    { key: 'source', header: 'Source', value: (entry) => this.sourceLabel(entry), sortable: true, width: '8rem' },
    { key: 'scope', header: 'Scope', value: (entry) => entry.scope, sortable: true, width: '6rem' },
    { key: 'publisher', header: 'Publisher', value: (entry) => entry.publisher ?? '', sortable: true, width: 'minmax(8rem, 1fr)', truncate: true },
    { key: 'state', header: 'State', value: (entry) => entry.state, sortable: true, width: '7rem' },
  ];
  protected readonly trackEntry = (_: number, entry: StartupEntry): string => entry.id;

  constructor() { if (this.platform.isDesktop()) void this.refresh(); }

  protected async refresh(): Promise<void> {
    this.loading.set(true); this.error.set(''); this.preview.set(null);
    try {
      const result: StartupProgramsResult = await window.dude.sys.startupList();
      this.entries.set(result.entries); this.warnings.set(result.warnings);
      if (!this.entries().some((entry) => entry.id === this.selectedId())) this.selectedId.set(null);
    } catch (caught) { this.error.set(caught instanceof Error ? caught.message : String(caught)); }
    finally { this.loading.set(false); }
  }

  protected async previewToggle(): Promise<void> {
    const entry = this.selected();
    const request = entry && startupToggleRequest(entry);
    if (!entry || !request) return;
    this.planning.set(true); this.planError.set(''); this.preview.set(null);
    try { this.preview.set(await this.mutations.plan(request)); }
    catch (caught) { this.planError.set(caught instanceof Error ? caught.message : String(caught)); }
    finally { this.planning.set(false); }
  }

  protected onApplied(_result: SysApplyResult): void { this.preview.set(null); void this.refresh(); }
  protected clearPreview(): void { this.preview.set(null); }
  protected sourceLabel(entry: StartupEntry): string {
    if (entry.source === 'registry-run') return (entry.detail?.includes('RunOnce') ? 'RunOnce' : 'Run') + ' · ' + (entry.id.split('|')[1]?.toUpperCase() ?? 'Registry') + ' · ' + (entry.id.split('|')[3] === '32' ? '32-bit view' : '64-bit view');
    return entry.source === 'startup-folder' ? 'Startup folder' : entry.source === 'scheduled-task' ? 'Task' : 'Service';
  }
  protected signatureLabel(entry: StartupEntry): string {
    return entry.signature === 'catalog-signed' ? 'Catalog signed' : entry.signature ?? 'Unknown';
  }
}
