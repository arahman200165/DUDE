import { DatePipe } from '@angular/common';
import { Component, WritableSignal, computed, effect, inject, input, model, output, signal, untracked } from '@angular/core';
import type {
  FileSignatureResult, ProcessDetail, ProcessHandle, ProcessHandlesResult, ProcessModule, ProcessSummary, ProcessThread, ServiceSummary, SocketEntry,
} from "@dude/contracts/system/system-types";
import { processKey } from "@dude/tool-engine/shared/system/cpu-delta";
import { diffEnvironments, summarizeEnvDiff, toDiffViewEntries, type EnvDiffEntry } from "@dude/tool-engine/shared/system/env-diff";
import { parseEnvDump } from "@dude/tool-engine/shared/system/env-dump-parse";
import type { SysSnapshotHeader } from "@dude/contracts/system/sys-mutation-types";
import { SystemCallError, SystemInfoService } from '../../core/platform/system-info.service';
import { SystemSnapshotService } from '../../core/platform/system-snapshot.service';
import { CopyButton } from '../../shared/components/copy-button/copy-button';
import { DataTable, type DataTableColumn } from '../../shared/components/data-table/data-table';
import { DataTableCellDef } from '../../shared/components/data-table/data-table-cell.directive';
import { DiffView } from '../../shared/components/diff-view/diff-view';
import { Disclosure } from '../../shared/components/disclosure/disclosure';
import { ElevationBanner } from '../../shared/components/elevation-banner/elevation-banner';
import { StatusGlyph, type StatusGlyphKind } from '../../shared/components/status-glyph/status-glyph';
import { SparklineChart } from '../../shared/components/workbench-charts/sparkline-chart';
import type { SparklinePoint } from "@dude/tool-engine/shared/components/workbench-charts/sparkline-chart-option";
import { formatBytes, formatCpuTime } from "@dude/tool-engine/tools/process-viewer/process-viewer-logic";

export type DetailTab = 'overview' | 'environment' | 'modules' | 'threads' | 'handles' | 'ports';
export const DETAIL_TABS: readonly { readonly id: DetailTab; readonly label: string }[] = [
  { id: 'overview', label: 'Overview' }, { id: 'environment', label: 'Environment' }, { id: 'modules', label: 'Modules' },
  { id: 'threads', label: 'Threads' }, { id: 'handles', label: 'Handles' }, { id: 'ports', label: 'Ports' },
];

interface Loadable<T> { readonly status: 'idle' | 'loading' | 'ready' | 'error'; readonly data: T | null; readonly error: string; readonly denied: boolean }
const idle = <T>(): Loadable<T> => ({ status: 'idle', data: null, error: '', denied: false });

interface ModuleInfo { readonly version: string; readonly company: string; readonly signature: FileSignatureResult | null }
interface ModuleRow { readonly module: ProcessModule; readonly info: ModuleInfo | undefined }
interface EnvRow { readonly name: string; readonly value: string }
type DiffSource = 'user' | 'system' | 'snapshot' | 'paste';

const SYSTEM_ENV_PATH = 'SYSTEM\\CurrentControlSet\\Control\\Session Manager\\Environment';
const CONCURRENCY = 4;

/** Selected-process detail: lazy tabs (each loads its data on first open), all read-only. */
@Component({
  selector: 'app-process-detail-pane',
  imports: [DatePipe, CopyButton, DataTable, DataTableCellDef, DiffView, Disclosure, ElevationBanner, StatusGlyph, SparklineChart],
  templateUrl: './process-detail-pane.html',
})
export class ProcessDetailPane {
  private readonly system = inject(SystemInfoService);
  private readonly snapshots = inject(SystemSnapshotService);

  readonly process = input<ProcessSummary | null>(null);
  readonly exited = input(false);
  readonly parent = input<ProcessSummary | null>(null);
  readonly children = input<readonly ProcessSummary[]>([]);
  readonly sockets = input<readonly SocketEntry[]>([]);
  readonly cpuPoints = input<readonly SparklinePoint[]>([]);
  readonly memoryPoints = input<readonly SparklinePoint[]>([]);
  readonly tab = model<DetailTab>('overview');

  /** Emits the key (`pid:startKey`) of a parent/child the user clicked. */
  readonly selectKey = output<string>();
  readonly detailLoaded = output<{ readonly key: string; readonly detail: ProcessDetail }>();
  readonly modulesLoaded = output<{ readonly key: string; readonly names: readonly string[] }>();

  protected readonly trackEnv = (_: number, r: EnvRow): string => r.name;
  protected readonly trackModule = (_: number, r: ModuleRow): string => r.module.baseAddress;
  protected readonly trackThread = (_: number, t: ProcessThread): number => t.tid;
  protected readonly trackHandle = (_: number, h: ProcessHandle): string => h.handle;
  protected readonly trackSocket = (i: number, s: SocketEntry): string => `${s.protocol}${i}`;
  protected readonly tabs = DETAIL_TABS;
  protected readonly bytes = formatBytes;
  protected readonly cpuTime = formatCpuTime;

  protected readonly detail = signal<Loadable<ProcessDetail>>(idle());
  protected readonly services = signal<readonly ServiceSummary[]>([]);
  protected readonly modules = signal<Loadable<readonly ProcessModule[]>>(idle());
  protected readonly threads = signal<Loadable<readonly ProcessThread[]>>(idle());
  protected readonly handles = signal<Loadable<ProcessHandlesResult>>(idle());
  protected readonly versionInfo = signal<ReadonlyMap<string, ModuleInfo>>(new Map());
  protected readonly versionProgress = signal<{ done: number; total: number } | null>(null);
  protected readonly handleTypeFilter = signal('');

  // environment tools
  protected readonly snapshotName = signal('');
  protected readonly snapshotMessage = signal('');
  protected readonly diffOpen = signal(false);
  protected readonly diffSource = signal<DiffSource>('user');
  protected readonly snapshotChoices = signal<readonly SysSnapshotHeader[]>([]);
  protected readonly snapshotChoice = signal('');
  protected readonly pasteText = signal('');
  protected readonly diffError = signal('');
  protected readonly diffBaseline = signal('');
  protected readonly diffEntries = signal<readonly EnvDiffEntry[] | null>(null);

  protected readonly key = computed(() => { const p = this.process(); return p ? processKey(p) : null; });
  protected readonly canSnapshot = this.snapshots.available;
  private loadedKey: string | null = null;

  protected readonly envRows = computed<readonly EnvRow[]>(() => {
    const env = this.detail().data?.environment;
    return env ? Object.entries(env).map(([name, value]) => ({ name, value })).sort((a, b) => a.name.toLowerCase().localeCompare(b.name.toLowerCase())) : [];
  });
  protected readonly envText = computed(() => this.envRows().map((r) => `${r.name}=${r.value}`).join('\r\n'));
  protected readonly envColumns: readonly DataTableColumn<EnvRow>[] = [
    { key: 'name', header: 'Name', value: (r) => r.name, sortable: true, width: '14rem' },
    { key: 'value', header: 'Value', value: (r) => r.value, truncate: true },
  ];

  protected readonly moduleRows = computed<readonly ModuleRow[]>(() => {
    const info = this.versionInfo();
    return (this.modules().data ?? []).map((module) => ({ module, info: info.get(module.path) }));
  });
  protected readonly moduleColumns: readonly DataTableColumn<ModuleRow>[] = [
    { key: 'name', header: 'Name', value: (r) => r.module.name, sortable: true, width: '11rem' },
    { key: 'version', header: 'Version', value: (r) => r.info?.version ?? '', sortable: true, width: '8rem' },
    { key: 'company', header: 'Company', value: (r) => r.info?.company ?? '', sortable: true, width: '10rem' },
    { key: 'signature', header: 'Signature', value: (r) => r.info?.signature?.status ?? '', sortable: true, width: '10rem' },
    { key: 'base', header: 'Base', value: (r) => r.module.baseAddress, width: '9rem' },
    { key: 'size', header: 'Size', value: (r) => String(r.module.size), sortable: true, width: '6rem' },
    { key: 'path', header: 'Path', value: (r) => r.module.path, truncate: true },
  ];
  protected readonly threadColumns: readonly DataTableColumn<ProcessThread>[] = [
    { key: 'tid', header: 'TID', value: (t) => String(t.tid), sortable: true, width: '5rem' },
    { key: 'state', header: 'State', value: (t) => (t.waitReason ? `${t.state} (${t.waitReason})` : t.state), sortable: true, width: '14rem' },
    { key: 'priority', header: 'Prio', value: (t) => String(t.priority), sortable: true, width: '4rem' },
    { key: 'base', header: 'Base', value: (t) => String(t.basePriority), sortable: true, width: '4rem' },
    { key: 'cpu', header: 'CPU time', value: (t) => String(t.kernelTime100ns + t.userTime100ns), sortable: true, width: '8rem' },
    { key: 'start', header: 'Start address', value: (t) => t.startAddress },
  ];
  protected readonly handleTypes = computed(() => [...new Set((this.handles().data?.handles ?? []).map((h) => h.type))].sort());
  protected readonly handleRows = computed<readonly ProcessHandle[]>(() => {
    const type = this.handleTypeFilter();
    const all = this.handles().data?.handles ?? [];
    return type ? all.filter((h) => h.type === type) : all;
  });
  protected readonly handleColumns: readonly DataTableColumn<ProcessHandle>[] = [
    { key: 'handle', header: 'Handle', value: (h) => h.handle, width: '6rem' },
    { key: 'type', header: 'Type', value: (h) => h.type, sortable: true, width: '9rem' },
    { key: 'name', header: 'Name', value: (h) => h.name ?? '', sortable: true, truncate: true },
  ];
  protected readonly portRows = computed(() => {
    const pid = this.process()?.pid;
    return this.sockets().filter((s) => s.pid === pid);
  });
  protected readonly portColumns: readonly DataTableColumn<SocketEntry>[] = [
    { key: 'protocol', header: 'Proto', value: (s) => `${s.protocol}${s.family === 6 ? '6' : ''}`, sortable: true, width: '4rem' },
    { key: 'local', header: 'Local', value: (s) => `${s.localAddress}:${s.localPort}`, sortable: true },
    { key: 'remote', header: 'Remote', value: (s) => (s.remoteAddress ? `${s.remoteAddress}:${s.remotePort}` : ''), sortable: true },
    { key: 'state', header: 'State', value: (s) => s.state ?? '', sortable: true, width: '8rem' },
  ];

  /** Fields that could not be read, plus tabs that were access-denied: drives the elevation banner. */
  protected readonly deniedCount = computed(() => {
    const errors = Object.values(this.detail().data?.errors ?? {}).filter((m) => /denied/i.test(m)).length;
    return errors + [this.detail().denied, this.modules().denied, this.threads().denied, this.handles().denied].filter(Boolean).length;
  });

  protected readonly overview = computed(() => {
    const d = this.detail().data;
    const p = this.process();
    if (!d || !p) return [];
    const yes = (v: boolean | null): string => (v === null ? '—' : v ? 'Yes' : 'No');
    return [
      { label: 'Image path', value: d.imagePath ?? '—', mono: true },
      { label: 'Working directory', value: d.currentDirectory ?? '—', mono: true },
      { label: 'User', value: d.user ? `${d.user.domain}\\${d.user.name}` : '—', mono: false },
      { label: 'Integrity', value: d.integrityLevel ?? '—', mono: false },
      { label: 'Elevated', value: yes(d.elevated), mono: false },
      { label: '32-bit on 64-bit (WOW64)', value: yes(d.wow64), mono: false },
      { label: 'Priority class', value: d.priorityClass ?? '—', mono: false },
      { label: 'Affinity', value: d.affinityMask ? `${d.affinityMask} of ${d.systemAffinityMask ?? '?'}` : '—', mono: true },
      { label: 'Session', value: String(p.sessionId), mono: false },
      { label: 'CPU time', value: this.cpuTime(p.kernelTime100ns + p.userTime100ns), mono: true },
      { label: 'Threads / handles', value: `${p.threadCount} / ${p.handleCount}`, mono: false },
      { label: 'Working set / private', value: `${this.bytes(p.workingSetBytes)} / ${this.bytes(p.privateBytes)}`, mono: false },
    ];
  });
  protected readonly unreadable = computed(() => Object.entries(this.detail().data?.errors ?? {}));

  constructor() {
    effect(() => {
      const key = this.key();
      const tab = this.tab();
      untracked(() => {
        if (key !== this.loadedKey) this.reset(key);
        if (key) this.ensureLoaded(tab);
      });
    });
  }

  private reset(key: string | null): void {
    this.loadedKey = key;
    this.detail.set(idle());
    this.services.set([]);
    this.modules.set(idle());
    this.threads.set(idle());
    this.handles.set(idle());
    this.versionInfo.set(new Map());
    this.versionProgress.set(null);
    this.handleTypeFilter.set('');
    this.diffEntries.set(null);
    this.diffError.set('');
    this.snapshotMessage.set('');
    const p = this.process();
    this.snapshotName.set(p ? `${p.name} (PID ${p.pid})` : '');
  }

  private ensureLoaded(tab: DetailTab): void {
    if (tab === 'overview' || tab === 'environment') void this.loadDetail();
    else if (tab === 'modules' && this.modules().status === 'idle') void this.loadModules();
    else if (tab === 'threads' && this.threads().status === 'idle') void this.loadThreads();
  }

  private ref(): { pid: number; startKey: string } {
    const p = this.process()!;
    return { pid: p.pid, startKey: p.startKey };
  }

  private async run<T>(slot: WritableSignal<Loadable<T>>, fn: () => Promise<T>): Promise<T | null> {
    const key = this.loadedKey;
    slot.set({ status: 'loading', data: null, error: '', denied: false });
    try {
      const data = await fn();
      if (key !== this.loadedKey) return null;
      slot.set({ status: 'ready', data, error: '', denied: false });
      return data;
    } catch (caught) {
      if (key === this.loadedKey) {
        slot.set({ status: 'error', data: null, error: caught instanceof Error ? caught.message : String(caught), denied: caught instanceof SystemCallError && caught.accessDenied });
      }
      return null;
    }
  }

  private async loadDetail(): Promise<void> {
    if (this.detail().status !== 'idle') return;
    const key = this.loadedKey;
    const ref = this.ref();
    const loaded = await this.run(this.detail, () => this.system.processDetail(ref));
    if (loaded && key) this.detailLoaded.emit({ key, detail: loaded });
    try {
      const all = (await this.system.listServices()).services;
      if (key === this.loadedKey) this.services.set(all.filter((s) => s.pid === ref.pid && s.state !== 'stopped'));
    } catch { /* services are a nicety on the Overview */ }
  }

  private async loadModules(): Promise<void> {
    const key = this.loadedKey;
    const ref = this.ref();
    const result = await this.run(this.modules, async () => (await this.system.processModules(ref)).modules);
    if (result && key) this.modulesLoaded.emit({ key, names: result.map((m) => m.name) });
  }

  private async loadThreads(): Promise<void> {
    const { pid } = this.ref();
    await this.run(this.threads, async () => (await this.system.processThreads(pid)).threads);
  }

  /** Handle enumeration can take seconds, so it only runs on request. */
  protected loadHandles(): void {
    const ref = this.ref();
    void this.run(this.handles, () => this.system.processHandles(ref));
  }

  /** Reads version resources and Authenticode signatures for each distinct module path, four at a time. */
  protected async loadVersions(): Promise<void> {
    const key = this.loadedKey;
    const paths = [...new Set((this.modules().data ?? []).map((m) => m.path).filter(Boolean))];
    const results = new Map<string, ModuleInfo>();
    let done = 0;
    let next = 0;
    this.versionProgress.set({ done: 0, total: paths.length });
    const worker = async (): Promise<void> => {
      while (next < paths.length && key === this.loadedKey) {
        const path = paths[next++];
        const [version, signature] = await Promise.allSettled([this.system.fileVersion(path), this.system.fileSignature(path)]);
        const strings = version.status === 'fulfilled' ? version.value.strings : {};
        results.set(path, {
          version: (version.status === 'fulfilled' && (version.value.fixed?.fileVersion ?? strings['FileVersion'])) || '',
          company: strings['CompanyName'] ?? '',
          signature: signature.status === 'fulfilled' ? signature.value : null,
        });
        done++;
        if (done % 8 === 0 && key === this.loadedKey) { this.versionInfo.set(new Map(results)); this.versionProgress.set({ done, total: paths.length }); }
      }
    };
    await Promise.all(Array.from({ length: CONCURRENCY }, worker));
    if (key !== this.loadedKey) return;
    this.versionInfo.set(new Map(results));
    this.versionProgress.set(null);
  }

  protected signatureGlyph(info: ModuleInfo | undefined): StatusGlyphKind {
    switch (info?.signature?.status) {
      case 'signed': case 'catalog-signed': return 'success';
      case 'unsigned': return 'warning';
      case 'invalid': return 'error';
      default: return 'neutral';
    }
  }

  // ---- environment: snapshot and diff --------------------------------------------------------

  protected async saveSnapshot(): Promise<void> {
    const env = this.detail().data?.environment;
    const p = this.process();
    if (!env || !p) return;
    this.snapshotMessage.set('');
    try {
      const header = await this.snapshots.save('process-env', this.snapshotName().trim() || `${p.name} (PID ${p.pid})`, `${p.name} (PID ${p.pid})`, env);
      this.snapshotMessage.set(`Saved snapshot "${header.name}".`);
    } catch (caught) { this.snapshotMessage.set(caught instanceof Error ? caught.message : String(caught)); }
  }

  protected async openDiff(): Promise<void> {
    this.diffOpen.set(true);
    if (this.snapshots.available) {
      try {
        const all = await this.snapshots.list();
        this.snapshotChoices.set(all.filter((h) => h.kind === 'env' || h.kind === 'process-env'));
      } catch { /* the snapshot source is simply empty */ }
    }
  }

  protected async compare(): Promise<void> {
    const env = this.detail().data?.environment;
    if (!env) return;
    this.diffError.set('');
    this.diffEntries.set(null);
    try {
      const { label, vars } = await this.baseline();
      this.diffBaseline.set(label);
      this.diffEntries.set(diffEnvironments(vars, env));
    } catch (caught) { this.diffError.set(caught instanceof Error ? caught.message : String(caught)); }
  }

  private async baseline(): Promise<{ label: string; vars: ReadonlyMap<string, string> | Record<string, string> }> {
    switch (this.diffSource()) {
      case 'user': return { label: 'User environment (registry, unexpanded)', vars: await this.registryEnv({ hive: 'HKCU', path: 'Environment', view: 'default' }) };
      case 'system': return { label: 'System environment (registry, unexpanded)', vars: await this.registryEnv({ hive: 'HKLM', path: SYSTEM_ENV_PATH, view: 'default' }) };
      case 'snapshot': {
        const header = this.snapshotChoices().find((h) => h.id === this.snapshotChoice());
        if (!header) throw new Error('Choose a snapshot first.');
        const snapshot = await this.snapshots.get(header.kind, header.id);
        const data = snapshot.data;
        if (!data || typeof data !== 'object') throw new Error('That snapshot does not hold an environment.');
        return { label: `Snapshot "${header.name}"`, vars: Object.fromEntries(Object.entries(data as Record<string, unknown>).map(([k, v]) => [k, String(v)])) };
      }
      default: {
        if (!this.pasteText().trim()) throw new Error('Paste a `set` dump, .env text, or a JSON object first.');
        return { label: 'Pasted environment', vars: parseEnvDump(this.pasteText()) };
      }
    }
  }

  private async registryEnv(params: { hive: 'HKCU' | 'HKLM'; path: string; view: 'default' }): Promise<Record<string, string>> {
    const values = (await this.system.registryValues(params)).values;
    const out: Record<string, string> = {};
    for (const v of values) {
      if (!v.name) continue;
      out[v.name] = Array.isArray(v.data) ? v.data.join(';') : String(v.data);
    }
    return out;
  }

  protected readonly diffView = computed(() => {
    const entries = this.diffEntries();
    return entries ? { entries: toDiffViewEntries(entries), summary: { ...summarizeEnvDiff(entries) }, paths: entries.filter((e) => e.pathBreakdown && (e.pathBreakdown.added.length || e.pathBreakdown.removed.length || e.pathBreakdown.reordered)) } : null;
  });

  protected setDiffSource(value: string): void { this.diffSource.set(value as DiffSource); }
}
