import { Component, DestroyRef, computed, inject, signal } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { RouterLink } from '@angular/router';
import { buildDependencyTree, buildDependentTree, edgesOfTrees, impactOfStopping, toMermaid } from '../../../shared-logic/system/service-graph';
import type { ServiceConfig, ServiceListResult, ServiceState, ServiceSummary } from '../../../shared-logic/system/system-types';
import { PersistenceService } from '../../core/persistence/persistence.service';
import { PlatformService } from '../../core/platform/platform.service';
import { SystemInfoService } from '../../core/platform/system-info.service';
import { CopyButton } from '../../shared/components/copy-button/copy-button';
import { DataTable, type DataTableColumn } from '../../shared/components/data-table/data-table';
import { DataTableCellDef } from '../../shared/components/data-table/data-table-cell.directive';
import { DesktopOnlyControl } from '../../shared/components/desktop-only-control/desktop-only-control';
import { LiveRefreshControl } from '../../shared/components/live-refresh-control/live-refresh-control';
import { SplitPane } from '../../shared/components/split-pane/split-pane';
import { StatusGlyph } from '../../shared/components/status-glyph/status-glyph';
import { ToolShell } from '../../shared/components/tool-shell/tool-shell';
import { TreeView } from '../../shared/components/tree-view/tree-view';
import { createLiveRefresh } from '../../shared/utils/live-refresh';
import { ServiceActions } from './service-actions';
import { filterServices, stateGlyph, stateLabel, startTypeLabel, toTreeNode } from './services-viewer-logic';

const TOOL_ID = 'services-viewer';
/** Upper bound on configs read while walking a service's dependency graph. */
const CLOSURE_LIMIT = 80;
const BATCH = 8;

const STATE_FILTERS: readonly (ServiceState | 'all')[] = ['all', 'running', 'stopped', 'paused'];

/**
 * Services Viewer (DUDE_PRD.md §21 Phase 31, Milestone 602). A visibility-aware loop samples `svc.list`;
 * selecting a service reads `svc.config` for it and (bounded) for its dependency/dependent closure, and
 * the pure `service-graph` helpers build the trees and the stop-impact set. Start/stop/restart/startup
 * type live in `ServiceActions` and only ever go through the system-change preview/confirm surface.
 */
@Component({
  selector: 'app-services-viewer',
  imports: [RouterLink, ToolShell, DesktopOnlyControl, LiveRefreshControl, SplitPane, DataTable, DataTableCellDef, StatusGlyph, TreeView, CopyButton, ServiceActions],
  templateUrl: './services-viewer.html',
})
export class ServicesViewerTool {
  protected readonly platform = inject(PlatformService);
  private readonly persistence = inject(PersistenceService);
  private readonly system = inject(SystemInfoService);
  private readonly route = inject(ActivatedRoute);

  protected readonly intervalMs = this.persistence.signal(TOOL_ID, 'intervalMs', 'local', 3000);
  protected readonly paused = this.persistence.signal(TOOL_ID, 'paused', 'local', false);
  protected readonly showDrivers = this.persistence.signal(TOOL_ID, 'showDrivers', 'local', false);
  protected readonly ratio = this.persistence.signal(TOOL_ID, 'splitRatio', 'local', 0.55);

  protected readonly listing = signal<ServiceListResult | null>(null);
  protected readonly error = signal('');
  protected readonly query = signal('');
  private readonly pendingService = signal('');
  protected readonly stateFilter = signal<ServiceState | 'all'>('all');
  protected readonly selectedName = signal<string | null>(null);
  protected readonly detailError = signal('');
  protected readonly loadingDetail = signal(false);
  protected readonly loadingTypes = signal(false);
  private readonly configs = signal<ReadonlyMap<string, ServiceConfig>>(new Map());

  protected readonly stateFilters = STATE_FILTERS;
  protected readonly stateLabel = stateLabel;
  protected readonly stateGlyph = stateGlyph;
  protected readonly startTypeLabel = startTypeLabel;

  protected readonly refresh = createLiveRefresh({
    intervalMs: this.intervalMs,
    paused: this.paused,
    destroyRef: inject(DestroyRef),
    tick: () => this.tick(),
  });

  private readonly hiddenDrivers = computed<ReadonlySet<string>>(() => {
    if (this.showDrivers()) return new Set();
    const hidden = new Set<string>();
    for (const [name, config] of this.configs()) if (config.isDriver) hidden.add(name);
    return hidden;
  });

  protected readonly rows = computed<readonly ServiceSummary[]>(() => this.listing()?.services ?? []);
  protected readonly filtered = computed(() => filterServices(this.rows(), this.query(), this.stateFilter(), this.hiddenDrivers()));

  protected readonly columns: readonly DataTableColumn<ServiceSummary>[] = [
    { key: 'name', header: 'Name', value: (s) => s.name, sortable: true, width: 'minmax(9rem, 1fr)', truncate: true },
    { key: 'displayName', header: 'Display name', value: (s) => s.displayName, sortable: true, width: 'minmax(11rem, 1.4fr)', truncate: true },
    { key: 'state', header: 'State', value: (s) => s.state, sortable: true, width: '7.5rem' },
    { key: 'pid', header: 'PID', value: (s) => String(s.pid), sortable: true, width: '4.5rem' },
    { key: 'startType', header: 'Startup', value: (s) => this.configs().get(s.name.toLowerCase())?.startType ?? '', sortable: true, width: '8rem' },
    { key: 'account', header: 'Account', value: (s) => this.configs().get(s.name.toLowerCase())?.account ?? '', sortable: true, width: '9rem', truncate: true },
  ];
  protected readonly trackRow = (_: number, s: ServiceSummary): string => s.name;

  protected readonly selectedSummary = computed(() => {
    const name = this.selectedName();
    return name ? this.rows().find((s) => s.name === name) ?? null : null;
  });

  /** The selected service's config, with its live state/PID overlaid from the latest list. */
  protected readonly selected = computed<ServiceConfig | null>(() => {
    const name = this.selectedName();
    const config = name ? this.configs().get(name.toLowerCase()) : undefined;
    if (!config) return null;
    const live = this.selectedSummary();
    return live ? { ...config, state: live.state, pid: live.pid } : config;
  });

  private readonly resolver = (name: string): ServiceConfig | undefined => this.configs().get(name.toLowerCase());
  protected readonly dependencyTree = computed(() => {
    const config = this.selected();
    return config ? [toTreeNode(buildDependencyTree(config, this.resolver), 'dependencies')] : [];
  });
  protected readonly dependentTree = computed(() => {
    const config = this.selected();
    return config ? [toTreeNode(buildDependentTree(config, this.resolver), 'dependents')] : [];
  });
  protected readonly mermaid = computed(() => {
    const config = this.selected();
    if (!config) return '';
    return toMermaid(config.name, edgesOfTrees(buildDependencyTree(config, this.resolver), buildDependentTree(config, this.resolver)));
  });
  protected readonly impact = computed(() => {
    const config = this.selected();
    return config ? impactOfStopping(config.name, [...this.configs().values()]) : [];
  });

  constructor() {
    const value = this.route.snapshot.queryParamMap.get('query')?.trim() ?? '';
    if (value.length > 0 && value.length <= 128 && !/[\u0000-\u001f\u007f]/.test(value)) {
      this.query.set(value);
      this.pendingService.set(value);
    }
  }
  private async tick(): Promise<void> {
    if (!this.platform.isDesktop()) return;
    try {
      const listing = await this.system.listServices();
      this.listing.set(listing);
      this.error.set('');
      const target = this.pendingService();
      if (target) {
        const match = listing.services.find((service) => service.name.toLowerCase() === target.toLowerCase() || service.displayName.toLowerCase() === target.toLowerCase());
        this.pendingService.set('');
        if (match) {
          this.selectedName.set(match.name);
          void this.loadClosure(match.name, true);
        }
      }
      this.error.set('');
    } catch (caught) {
      this.error.set(caught instanceof Error ? caught.message : String(caught));
    }
  }

  private async fetchConfig(name: string): Promise<ServiceConfig | undefined> {
    try { return (await this.system.call('svc.config', { name })).config; }
    catch { return undefined; }
  }

  protected select(row: ServiceSummary): void {
    this.selectedName.set(row.name);
    void this.loadClosure(row.name, true);
  }

  /** Reads the selected service's config, then walks dependencies and dependents breadth-first (bounded). */
  private async loadClosure(name: string, force: boolean): Promise<void> {
    this.loadingDetail.set(true);
    this.detailError.set('');
    const next = new Map(this.configs());
    const queue = [name];
    const seen = new Set<string>();
    let fetched = 0;
    while (queue.length && fetched < CLOSURE_LIMIT) {
      const current = queue.shift()!;
      const k = current.toLowerCase();
      if (seen.has(k)) continue;
      seen.add(k);
      let config = force && k === name.toLowerCase() ? undefined : next.get(k);
      if (!config) {
        config = await this.fetchConfig(current);
        fetched++;
        if (config) next.set(k, config);
      }
      if (!config) {
        if (k === name.toLowerCase()) this.detailError.set(`Could not read the configuration of ${name}.`);
        continue;
      }
      queue.push(...config.dependencies, ...config.dependents);
    }
    if (this.selectedName() === name) this.configs.set(next);
    else this.configs.update((m) => new Map([...m, ...next]));
    this.loadingDetail.set(false);
  }

  /** Reads startup type and account for every service currently listed (batched), to fill those columns. */
  protected async loadStartTypes(): Promise<void> {
    this.loadingTypes.set(true);
    try {
      const todo = this.filtered().filter((s) => !this.configs().has(s.name.toLowerCase()));
      for (let i = 0; i < todo.length; i += BATCH) {
        const results = await Promise.all(todo.slice(i, i + BATCH).map((s) => this.fetchConfig(s.name)));
        this.configs.update((m) => {
          const next = new Map(m);
          for (const config of results) if (config) next.set(config.name.toLowerCase(), config);
          return next;
        });
      }
    } finally { this.loadingTypes.set(false); }
  }

  protected onApplied(): void {
    const name = this.selectedName();
    void this.refresh.refreshNow();
    if (name) void this.loadClosure(name, true);
  }

  protected setQuery(value: string): void { this.query.set(value); }
}
