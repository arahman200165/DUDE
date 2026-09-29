import { Component, DestroyRef, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import type { SysApplyResult, SysPlanPreview } from '../../../shared-logic/system/sys-mutation-types';
import { PersistenceService } from '../../core/persistence/persistence.service';
import { PlatformService } from '../../core/platform/platform.service';
import { SystemInfoService } from '../../core/platform/system-info.service';
import { SystemMutationService } from '../../core/platform/system-mutation.service';
import { DataTable, type DataTableColumn } from '../../shared/components/data-table/data-table';
import { DataTableCellDef } from '../../shared/components/data-table/data-table-cell.directive';
import { DesktopOnlyControl } from '../../shared/components/desktop-only-control/desktop-only-control';
import { LiveRefreshControl } from '../../shared/components/live-refresh-control/live-refresh-control';
import { StatusGlyph } from '../../shared/components/status-glyph/status-glyph';
import { SystemChangePreview } from '../../shared/components/system-change-preview/system-change-preview';
import { ToolShell } from '../../shared/components/tool-shell/tool-shell';
import { createLiveRefresh } from '../../shared/utils/live-refresh';
import {
  endOwnerRequest, filterByQuery, formatEndpoint, isListening, joinSocketsToProcesses, rowKey, type PortRow,
} from './port-process-lookup-logic';

const TOOL_ID = 'port-process-lookup';

/**
 * Port to Process Lookup (DUDE_PRD.md §21 Phase 31, Milestone 597). A live join of the TCP/UDP socket
 * tables to the process list. "End owner" only builds a plan and opens the system-change preview;
 * nothing is issued or applied without that surface's separate confirm step.
 */
@Component({
  selector: 'app-port-process-lookup',
  imports: [RouterLink, ToolShell, DesktopOnlyControl, LiveRefreshControl, DataTable, DataTableCellDef, StatusGlyph, SystemChangePreview],
  templateUrl: './port-process-lookup.html',
})
export class PortProcessLookupTool {
  protected readonly platform = inject(PlatformService);
  private readonly persistence = inject(PersistenceService);
  private readonly system = inject(SystemInfoService);
  private readonly mutations = inject(SystemMutationService);

  protected readonly intervalMs = this.persistence.signal(TOOL_ID, 'intervalMs', 'local', 2000);
  protected readonly paused = this.persistence.signal(TOOL_ID, 'paused', 'local', false);
  protected readonly listeningOnly = this.persistence.signal(TOOL_ID, 'listeningOnly', 'local', false);

  protected readonly all = signal<readonly PortRow[] | null>(null);
  protected readonly query = signal('');
  protected readonly error = signal('');
  protected readonly actionError = signal('');
  protected readonly busy = signal(false);
  protected readonly preview = signal<SysPlanPreview | null>(null);

  protected readonly refresh = createLiveRefresh({
    intervalMs: this.intervalMs,
    paused: this.paused,
    destroyRef: inject(DestroyRef),
    tick: () => this.tick(),
  });

  protected readonly rows = computed(() => {
    const filtered = filterByQuery(this.all() ?? [], this.query());
    return this.listeningOnly() ? filtered.filter(isListening) : filtered;
  });

  protected readonly columns: readonly DataTableColumn<PortRow>[] = [
    { key: 'protocol', header: 'Proto', value: (r) => r.protocol.toUpperCase(), sortable: true, width: '4rem' },
    { key: 'local', header: 'Local', value: (r) => formatEndpoint(r.localAddress, r.localPort), sortable: true, width: 'minmax(10rem, 1fr)', truncate: true },
    { key: 'remote', header: 'Remote', value: (r) => formatEndpoint(r.remoteAddress, r.remotePort), sortable: true, width: 'minmax(10rem, 1fr)', truncate: true },
    { key: 'state', header: 'State', value: (r) => r.state ?? '', sortable: true, width: '7rem' },
    { key: 'pid', header: 'PID', value: (r) => String(r.pid), sortable: true, width: '4.5rem' },
    { key: 'process', header: 'Process', value: (r) => r.processName, sortable: true, width: 'minmax(9rem, 1fr)', truncate: true },
    { key: 'actions', header: 'Actions', value: () => '', width: '15rem' },
  ];
  protected readonly trackRow = (_: number, r: PortRow): string => rowKey(r);

  private async tick(): Promise<void> {
    if (!this.platform.isDesktop()) return;
    try {
      const [tcp, udp, processes] = await Promise.all([this.system.tcpTable(), this.system.udpTable(), this.system.listProcesses()]);
      this.all.set(joinSocketsToProcesses(tcp, udp, processes));
      this.error.set('');
    } catch (caught) {
      this.error.set(caught instanceof Error ? caught.message : String(caught));
    }
  }

  /** Only asks the main process to build a plan; nothing is issued or applied here. */
  protected async endOwner(row: PortRow): Promise<void> {
    const request = endOwnerRequest(row);
    if (!request) return;
    this.actionError.set('');
    this.busy.set(true);
    try { this.preview.set(await this.mutations.plan(request)); }
    catch (caught) { this.preview.set(null); this.actionError.set(caught instanceof Error ? caught.message : String(caught)); }
    finally { this.busy.set(false); }
  }

  protected onApplied(_result: SysApplyResult): void { void this.refresh.refreshNow(); }

  protected canEnd(row: PortRow): boolean { return row.startKey !== ''; }
}
