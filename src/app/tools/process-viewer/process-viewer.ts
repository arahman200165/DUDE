import { DatePipe } from '@angular/common';
import { ActivatedRoute } from '@angular/router';
import { Component, DestroyRef, computed, inject, signal } from '@angular/core';
import type { ProcessDetail, ProcessListResult, ProcessSummary, SocketEntry } from '../../../shared-logic/system/system-types';
import { cpuPercents, processKey } from '../../../shared-logic/system/cpu-delta';
import { ancestorKeys, ancestorsOf, buildProcessForest, filterForest, flattenForest } from '../../../shared-logic/system/process-tree';
import { PersistenceService } from '../../core/persistence/persistence.service';
import { PlatformService } from '../../core/platform/platform.service';
import { SystemInfoService } from '../../core/platform/system-info.service';
import { DataTable, type DataTableColumn } from '../../shared/components/data-table/data-table';
import { DataTableCellDef } from '../../shared/components/data-table/data-table-cell.directive';
import { DesktopOnlyControl } from '../../shared/components/desktop-only-control/desktop-only-control';
import { LiveRefreshControl } from '../../shared/components/live-refresh-control/live-refresh-control';
import { SplitPane } from '../../shared/components/split-pane/split-pane';
import { StatusGlyph } from '../../shared/components/status-glyph/status-glyph';
import { ToolShell } from '../../shared/components/tool-shell/tool-shell';
import type { SparklinePoint } from '../../shared/components/workbench-charts/sparkline-chart-option';
import { createLiveRefresh } from '../../shared/utils/live-refresh';
import { ProcessActions } from './process-actions';
import { ProcessDetailPane, type DetailTab } from './process-detail-pane';
import { formatAge, formatBytes, formatCpu, filterRows, parseQuery, pushSample, type ProcessRow, type SearchContext } from './process-viewer-logic';

const TOOL_ID = 'process-viewer';
const MIB = 1024 * 1024;

type View = 'list' | 'tree';
interface TableRow { readonly row: ProcessRow; readonly depth: number; readonly hasChildren: boolean; readonly expanded: boolean }
interface History { cpu: number[]; memory: number[] }

/**
 * Process Viewer (DUDE_PRD.md §21 Phase 31, Milestone 595): a task manager. A visibility-aware
 * live loop samples `process.list`; a selected process opens a lazy detail pane (command line,
 * environment, modules, threads, handles, ports). Actions (end, restart, suspend, priority, affinity, dump) live in `ProcessActions` and only ever go through the system-change preview/confirm surface.
 */
@Component({
  selector: 'app-process-viewer',
  imports: [DatePipe, ToolShell, DesktopOnlyControl, LiveRefreshControl, SplitPane, DataTable, DataTableCellDef, StatusGlyph, ProcessDetailPane, ProcessActions],
  templateUrl: './process-viewer.html',
})
export class ProcessViewerTool {
  protected readonly platform = inject(PlatformService);
  private readonly persistence = inject(PersistenceService);
  private readonly system = inject(SystemInfoService);
  private readonly route = inject(ActivatedRoute);

  protected readonly intervalMs = this.persistence.signal(TOOL_ID, 'intervalMs', 'local', 2000);
  protected readonly paused = this.persistence.signal(TOOL_ID, 'paused', 'local', false);
  protected readonly view = this.persistence.signal<View>(TOOL_ID, 'view', 'local', 'list');
  protected readonly ratio = this.persistence.signal(TOOL_ID, 'splitRatio', 'local', 0.62);

  protected readonly listing = signal<ProcessListResult | null>(null);
  private readonly cpu = signal<ReadonlyMap<string, number>>(new Map());
  private readonly historyVersion = signal(0);
  private readonly history = new Map<string, History>();
  private previous: ProcessListResult | null = null;

  protected readonly query = signal('');
  protected readonly routeNotice = signal('');
  private routeHandoffApplied = false;
  private readonly routeTarget = this.parseRouteTarget();
  protected readonly error = signal('');
  protected readonly selectedKey = signal<string | null>(null);
  private readonly lastSelected = signal<ProcessSummary | null>(null);
  protected readonly tab = signal<DetailTab>('overview');
  protected readonly collapsed = signal<ReadonlySet<string>>(new Set());
  protected readonly sockets = signal<readonly SocketEntry[]>([]);
  private readonly commandLines = signal<ReadonlyMap<string, string>>(new Map());
  private readonly modulesByKey = signal<ReadonlyMap<string, readonly string[]>>(new Map());
  private readonly userByKey = signal<ReadonlyMap<string, string>>(new Map());

  protected readonly refresh = createLiveRefresh({
    intervalMs: this.intervalMs,
    paused: this.paused,
    destroyRef: inject(DestroyRef),
    tick: () => this.tick(),
  });

  protected readonly rows = computed<readonly ProcessRow[]>(() => {
    const listing = this.listing();
    const cpu = this.cpu();
    return (listing?.processes ?? []).map((process) => {
      const key = processKey(process);
      return { process, key, cpu: cpu.get(key) ?? 0 };
    });
  });
  private readonly rowByKey = computed(() => new Map(this.rows().map((row) => [row.key, row])));

  private readonly context = computed<SearchContext>(() => {
    const portsByPid = new Map<number, number[]>();
    for (const socket of this.sockets()) {
      const list = portsByPid.get(socket.pid) ?? [];
      list.push(socket.localPort);
      portsByPid.set(socket.pid, list);
    }
    return { commandLines: this.commandLines(), modulesByKey: this.modulesByKey(), portsByPid };
  });
  protected readonly filtered = computed(() => filterRows(this.rows(), this.query(), this.context()));
  private readonly forest = computed(() => buildProcessForest(this.rows().map((r) => r.process)));

  protected readonly tableRows = computed<readonly TableRow[]>(() => {
    if (this.view() === 'list') return this.filtered().map((row) => ({ row, depth: 0, hasChildren: false, expanded: false }));
    const byKey = this.rowByKey();
    const filtering = this.query().trim() !== '';
    const matches = new Set(this.filtered().map((r) => r.key));
    const forest = filtering ? filterForest(this.forest(), (p) => matches.has(processKey(p))) : this.forest();
    const expanded = filtering ? ancestorKeys(forest) : new Set([...ancestorKeys(forest)].filter((k) => !this.collapsed().has(k)));
    return flattenForest(forest, expanded).flatMap(({ node, expanded: open, hasChildren }) => {
      const row = byKey.get(node.key);
      return row ? [{ row, depth: node.depth, hasChildren, expanded: open }] : [];
    });
  });

  protected readonly columns = computed<readonly DataTableColumn<TableRow>[]>(() => {
    const sortable = this.view() === 'list';
    return [
      { key: 'name', header: 'Name', value: (r) => r.row.process.name, sortable, width: 'minmax(11rem, 1fr)' },
      { key: 'pid', header: 'PID', value: (r) => String(r.row.process.pid), sortable, width: '4.5rem' },
      { key: 'cpu', header: 'CPU %', value: (r) => String(r.row.cpu), sortable, width: '4.5rem' },
      { key: 'spark', header: 'Trend', value: () => '', width: '4.5rem' },
      { key: 'workingSet', header: 'Working set', value: (r) => String(r.row.process.workingSetBytes), sortable, width: '6rem' },
      { key: 'private', header: 'Private', value: (r) => String(r.row.process.privateBytes), sortable, width: '6rem' },
      { key: 'threads', header: 'Thr', value: (r) => String(r.row.process.threadCount), sortable, width: '3.5rem' },
      { key: 'user', header: 'User', value: (r) => this.userByKey().get(r.row.key) ?? '', sortable, width: '7rem', truncate: true },
      { key: 'session', header: 'Sess', value: (r) => String(r.row.process.sessionId), sortable, width: '3.5rem' },
      { key: 'started', header: 'Age', value: (r) => String(r.row.process.createTimeMs), sortable, width: '5rem' },
    ];
  });

  protected readonly selected = computed(() => {
    const key = this.selectedKey();
    if (!key) return null;
    return this.rowByKey().get(key)?.process ?? this.lastSelected();
  });
  protected readonly exited = computed(() => {
    const key = this.selectedKey();
    return !!key && this.listing() !== null && !this.rowByKey().has(key);
  });
  protected readonly parent = computed(() => {
    const p = this.selected();
    if (!p) return null;
    const chain = ancestorsOf(this.forest(), processKey(p));
    const candidate = chain[chain.length - 1];
    return candidate && candidate.pid === p.parentPid ? candidate : null;
  });
  protected readonly childProcesses = computed(() => {
    const p = this.selected();
    if (!p || this.exited()) return [];
    return this.rows().map((r) => r.process).filter((c) => c.parentPid === p.pid && c.pid !== p.pid && c.createTimeMs >= p.createTimeMs);
  });
  protected readonly cpuPoints = computed(() => this.points((h) => h.cpu, (v) => Math.round(v * 10) / 10));
  protected readonly memoryPoints = computed(() => this.points((h) => h.memory, (v) => Math.round(v)));

  protected readonly format = { bytes: formatBytes, cpu: formatCpu, age: formatAge };
  protected readonly trackRow = (_: number, r: TableRow): string => r.row.key;

  protected now(): number { return this.listing()?.sampledAtMs ?? 0; }

  private points(pick: (h: History) => number[], round: (v: number) => number): SparklinePoint[] {
    this.historyVersion();
    const key = this.selectedKey();
    const samples = key ? pick(this.history.get(key) ?? { cpu: [], memory: [] }) : [];
    return samples.map((value, i) => ({ label: String(i + 1), value: round(value) }));
  }

  /** SVG polyline points for a row's recent CPU (0-100 scaled to its own peak so idle rows stay flat). */
  protected spark(key: string): string {
    this.historyVersion();
    const samples = this.history.get(key)?.cpu ?? [];
    if (samples.length < 2) return '';
    const peak = Math.max(5, ...samples);
    const step = 60 / (samples.length - 1);
    return samples.map((v, i) => `${(i * step).toFixed(1)},${(14 - (v / peak) * 13).toFixed(1)}`).join(' ');
  }

  private parseRouteTarget(): { readonly pid: number; readonly startKey: string } | null {
    const params = this.route.snapshot.queryParamMap;
    const pidText = params.get('pid') ?? '';
    const startKey = params.get('startKey') ?? '';
    if (!/^[1-9][0-9]{0,9}$/.test(pidText) || !/^[0-9]{1,20}$/.test(startKey)) return null;
    const pid = Number(pidText);
    try {
      if (!Number.isSafeInteger(pid) || pid > 0xffffffff || BigInt(startKey) > 18446744073709551615n) return null;
    } catch { return null; }
    return { pid, startKey };
  }
  private async tick(): Promise<void> {
    if (!this.platform.isDesktop()) return;
    try {
      const next = await this.system.listProcesses();
      const percents = cpuPercents(this.previous, next);
      this.previous = next;
      this.record(next, percents);
      this.cpu.set(percents);
      this.listing.set(next);
      this.error.set('');
      if (!this.routeHandoffApplied && this.routeTarget) {
        this.routeHandoffApplied = true;
        const target = next.processes.find((p) => p.pid === this.routeTarget!.pid && p.startKey === this.routeTarget!.startKey);
        if (target) this.selectKey(processKey(target));
        else this.routeNotice.set('That process instance is no longer running; the PID was not reused for this link.');
      }
      const key = this.selectedKey();
      const current = key ? next.processes.find((p) => processKey(p) === key) : undefined;
      if (current) this.lastSelected.set(current);
      if (this.needSockets()) await this.loadSockets();
    } catch (caught) {
      this.error.set(caught instanceof Error ? caught.message : String(caught));
    }
  }

  private record(next: ProcessListResult, percents: ReadonlyMap<string, number>): void {
    const live = new Set<string>();
    for (const p of next.processes) {
      const key = processKey(p);
      live.add(key);
      const h = this.history.get(key) ?? { cpu: [], memory: [] };
      h.cpu = pushSample(h.cpu, percents.get(key) ?? 0);
      h.memory = pushSample(h.memory, p.workingSetBytes / MIB);
      this.history.set(key, h);
    }
    for (const key of this.history.keys()) if (!live.has(key)) this.history.delete(key);
    this.historyVersion.update((v) => v + 1);
  }

  private needSockets(): boolean {
    if (this.selectedKey() && this.tab() === 'ports') return true;
    return parseQuery(this.query()).some((t) => t.field === 'port' || (t.field === 'any' && /^\d+$/.test(t.value)));
  }

  private async loadSockets(): Promise<void> {
    try {
      const [tcp, udp] = await Promise.all([this.system.tcpTable(), this.system.udpTable()]);
      this.sockets.set([...tcp.entries, ...udp.entries]);
    } catch { /* ports are optional context; the process list itself is still live */ }
  }

  // ---- interaction ---------------------------------------------------------------------------

  protected select(row: TableRow): void { this.selectKey(row.row.key); }

  protected selectKey(key: string): void {
    this.selectedKey.set(key);
    const process = this.rowByKey().get(key)?.process;
    if (process) this.lastSelected.set(process);
  }

  protected setTab(tab: DetailTab): void {
    this.tab.set(tab);
    if (tab === 'ports') void this.loadSockets();
  }

  protected toggle(row: TableRow, event: Event): void {
    event.stopPropagation();
    if (this.query().trim()) return;
    this.collapsed.update((set) => {
      const next = new Set(set);
      if (next.has(row.row.key)) next.delete(row.row.key);
      else next.add(row.row.key);
      return next;
    });
  }

  protected setQuery(value: string): void {
    this.query.set(value);
    if (parseQuery(value).some((t) => t.field === 'port' || (t.field === 'any' && /^\d+$/.test(t.value)))) void this.loadSockets();
  }

  protected onDetail(event: { key: string; detail: ProcessDetail }): void {
    this.commandLines.update((m) => new Map(m).set(event.key, event.detail.commandLine ?? ''));
    if (event.detail.user) this.userByKey.update((m) => new Map(m).set(event.key, `${event.detail.user!.domain}\\${event.detail.user!.name}`));
  }

  protected onModules(event: { key: string; names: readonly string[] }): void {
    this.modulesByKey.update((m) => new Map(m).set(event.key, event.names));
  }
}
