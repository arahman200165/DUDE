import { Component, DestroyRef, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ActivatedRoute } from '@angular/router';
import {
  allSectionsOn, estimateSections, type BundleEstimate, type BundleProgress, type BundleSectionId, type BundleToggles, type BundleWriteResult,
} from '../../../shared-logic/system/bundle-types';
import type { ProcessListResult, ProcessSummary } from '../../../shared-logic/system/system-types';
import { PersistenceService } from '../../core/persistence/persistence.service';
import { NativeFsService } from '../../core/platform/native-fs.service';
import { PlatformService } from '../../core/platform/platform.service';
import { SystemBundleService } from '../../core/platform/system-bundle.service';
import { SystemInfoService } from '../../core/platform/system-info.service';
import { Disclosure } from '../../shared/components/disclosure/disclosure';
import { DesktopOnlyControl } from '../../shared/components/desktop-only-control/desktop-only-control';
import { ElevationBanner } from '../../shared/components/elevation-banner/elevation-banner';
import { StatusGlyph } from '../../shared/components/status-glyph/status-glyph';
import { ToolShell } from '../../shared/components/tool-shell/tool-shell';
import {
  buildPreviewRows, clampOptions, defaultBundleName, filterProcesses, findTarget, formatBytes, newExportId, parseTargetRoute, selectedBytes,
  selectedCount, sizeWarning, type TargetRoute,
} from './process-diagnostic-bundle-logic';

const TOOL_ID = 'process-diagnostic-bundle';
type Phase = 'idle' | 'running' | 'done' | 'error';

/**
 * Process Diagnostic Bundle (DUDE_PRD.md §21 Phase 31, Milestone 613). Choosing a process, toggling
 * sections and reading the size preview only ever ask main for an estimate; nothing is collected, dumped or
 * written until the user clicks Export and then confirms a path in the native save dialog. Main re-collects
 * every section itself and streams the ZIP to that path.
 */
@Component({
  selector: 'app-process-diagnostic-bundle',
  imports: [ToolShell, DesktopOnlyControl, ElevationBanner, StatusGlyph, Disclosure],
  templateUrl: './process-diagnostic-bundle.html',
})
export class ProcessDiagnosticBundleTool {
  protected readonly platform = inject(PlatformService);
  private readonly persistence = inject(PersistenceService);
  private readonly system = inject(SystemInfoService);
  private readonly bundle = inject(SystemBundleService);
  private readonly nativeFs = inject(NativeFsService);
  private readonly route = inject(ActivatedRoute);
  private readonly destroyRef = inject(DestroyRef);

  protected readonly eventHours = this.persistence.signal(TOOL_ID, 'eventHours', 'local', 24);
  protected readonly sampleSeconds = this.persistence.signal(TOOL_ID, 'sampleSeconds', 'local', 10);
  protected readonly fullDump = this.persistence.signal(TOOL_ID, 'fullDump', 'local', false);

  protected readonly listing = signal<ProcessListResult | null>(null);
  protected readonly listError = signal('');
  protected readonly query = signal('');
  protected readonly notice = signal('');
  protected readonly target = signal<ProcessSummary | null>(null);
  protected readonly estimate = signal<BundleEstimate | null>(null);
  protected readonly estimating = signal(false);
  protected readonly estimateError = signal('');
  protected readonly toggles = signal<BundleToggles>(allSectionsOn());

  protected readonly phase = signal<Phase>('idle');
  protected readonly progress = signal<BundleProgress | null>(null);
  protected readonly result = signal<BundleWriteResult | null>(null);
  protected readonly exportError = signal('');
  private exportId: string | null = null;
  private pendingRoute: TargetRoute | null = null;

  protected readonly options = computed(() => clampOptions({ eventHours: this.eventHours(), sampleSeconds: this.sampleSeconds(), fullDump: this.fullDump() }));
  protected readonly visible = computed(() => filterProcesses(this.listing()?.processes ?? [], this.query()));
  private readonly estimates = computed(() => {
    const estimate = this.estimate();
    return estimate ? estimateSections(estimate.counts, this.options(), estimate.elevated) : [];
  });
  protected readonly rows = computed(() => buildPreviewRows(this.estimates(), this.toggles()));
  protected readonly total = computed(() => selectedBytes(this.estimates(), this.toggles()));
  protected readonly count = computed(() => selectedCount(this.toggles()));
  protected readonly warning = computed(() => sizeWarning(this.total(), this.toggles().minidump, this.options().fullDump));
  protected readonly running = computed(() => this.phase() === 'running');
  protected readonly canExport = computed(() => !!this.target() && !!this.estimate() && this.count() > 0 && !this.running());
  protected readonly percent = computed(() => {
    const p = this.progress();
    return p && p.total > 0 ? Math.min(100, Math.round((p.done / p.total) * 100)) : 0;
  });
  protected readonly progressLabel = computed(() => {
    const p = this.progress();
    if (!p) return 'Starting…';
    if (p.phase === 'sampling' && p.sample) return `Sampling CPU and memory (${p.sample.done} of ${p.sample.total})…`;
    if (p.phase === 'dumping') return 'Writing the minidump (this can take a while)…';
    if (p.phase === 'writing') return 'Writing the ZIP…';
    if (p.phase === 'done') return 'Done';
    return `Collecting ${p.section ?? ''}…`.replace(' …', '…');
  });
  protected readonly failedSections = computed(() => (this.result()?.sections ?? []).filter((s) => s.status === 'error'));

  protected readonly format = { bytes: formatBytes };
  protected readonly trackId = (_: number, item: { id: BundleSectionId }): string => item.id;
  protected readonly trackProcess = (_: number, p: ProcessSummary): string => `${p.pid}:${p.startKey}`;

  constructor() {
    this.route.queryParamMap.pipe(takeUntilDestroyed()).subscribe((params) => {
      this.pendingRoute = parseTargetRoute(params.get('pid'), params.get('startKey'));
      if (this.listing()) this.applyRoute();
    });
    this.destroyRef.onDestroy(() => { if (this.exportId && this.running()) void this.bundle.cancel(this.exportId); });
    if (this.platform.isDesktop()) void this.loadProcesses();
  }

  protected async loadProcesses(): Promise<void> {
    this.listError.set('');
    try {
      this.listing.set(await this.system.listProcesses());
      this.applyRoute();
    } catch (caught) { this.listError.set(caught instanceof Error ? caught.message : String(caught)); }
  }

  private applyRoute(): void {
    const route = this.pendingRoute;
    const list = this.listing();
    if (!route || !list) return;
    this.pendingRoute = null;
    const found = findTarget(list.processes, route);
    if (found) void this.choose(found);
    else this.notice.set(route.startKey === null ? 'No running process has that PID.' : 'That process instance is no longer running; the PID was not reused for this link.');
  }

  protected async choose(process: ProcessSummary): Promise<void> {
    if (this.running()) return;
    this.target.set(process);
    this.notice.set('');
    this.result.set(null);
    this.exportError.set('');
    this.phase.set('idle');
    await this.loadEstimate();
  }

  protected async loadEstimate(): Promise<void> {
    const process = this.target();
    if (!process) return;
    this.estimating.set(true);
    this.estimateError.set('');
    this.estimate.set(null);
    try {
      const estimate = await this.bundle.estimate({ pid: process.pid, startKey: process.startKey }, this.options());
      if (this.target() === process) this.estimate.set(estimate);
    } catch (caught) {
      if (this.target() === process) this.estimateError.set(caught instanceof Error ? caught.message : String(caught));
    } finally { this.estimating.set(false); }
  }

  protected toggle(id: BundleSectionId, on: boolean): void { this.toggles.update((t) => ({ ...t, [id]: on })); }
  protected setAll(on: boolean): void { this.toggles.set(Object.fromEntries(Object.keys(this.toggles()).map((id) => [id, on])) as unknown as BundleToggles); }
  protected setNumber(kind: 'eventHours' | 'sampleSeconds', value: string): void {
    const n = Number(value);
    if (kind === 'eventHours') this.eventHours.set(n); else this.sampleSeconds.set(n);
  }

  /** The explicit step: nothing is collected or written before the native save dialog confirms a path. */
  protected async export(): Promise<void> {
    const process = this.target();
    if (!process || !this.canExport()) return;
    this.exportError.set('');
    let savePath: string;
    try {
      const picked = await this.nativeFs.pickSavePath({ defaultName: defaultBundleName(process), filters: [{ name: 'ZIP archive', extensions: ['zip'] }] });
      if (picked.canceled) return;
      savePath = picked.path;
    } catch (caught) { this.exportError.set(caught instanceof Error ? caught.message : String(caught)); this.phase.set('error'); return; }

    const exportId = newExportId();
    this.exportId = exportId;
    this.result.set(null);
    this.progress.set(null);
    this.phase.set('running');
    const stop = this.bundle.onProgress((event) => { if (event.exportId === exportId) this.progress.set(event); });
    try {
      this.result.set(await this.bundle.write({ pid: process.pid, startKey: process.startKey }, exportId, this.toggles(), this.options(), savePath));
      this.phase.set('done');
    } catch (caught) {
      this.exportError.set(caught instanceof Error ? caught.message : String(caught));
      this.phase.set('error');
    } finally { stop(); this.exportId = null; }
  }

  protected cancel(): void { if (this.exportId) void this.bundle.cancel(this.exportId); }

  protected async reveal(): Promise<void> {
    const path = this.result()?.path;
    if (path) await this.bundle.reveal(path);
  }
}
