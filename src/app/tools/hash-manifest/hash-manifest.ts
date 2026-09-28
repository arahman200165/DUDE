import { Component, computed, inject, signal } from '@angular/core';
import { ScrollingModule } from '@angular/cdk/scrolling';
import { HASH_ALGORITHMS, type HashAlgorithm } from '../../../shared-logic/hash-compute';
import type { WalkOptions } from '../../../shared-logic/fs/fs-types';
import { DEFAULT_WALK_OPTIONS } from '../../../shared-logic/fs/walk-filter';
import { formatBytes } from '../../../shared-logic/fs/format-size';
import { formatBsd, formatCsv, formatGnu, formatJson, MERKLE_DESCRIPTION, parseManifest, type ManifestEntry } from '../../../shared-logic/fs/manifest-format';
import type { SnapshotChange, SnapshotDiffItem, SnapshotHeader } from '../../../shared-logic/fs/snapshot-diff';
import { ToolShell } from '../../shared/components/tool-shell/tool-shell';
import { DesktopOnlyControl } from '../../shared/components/desktop-only-control/desktop-only-control';
import { FsRootPicker } from '../../shared/components/fs-root-picker/fs-root-picker';
import { WalkOptionsPanel } from '../../shared/components/walk-options/walk-options';
import { ScanProgress } from '../../shared/components/scan-progress/scan-progress';
import { CopyButton } from '../../shared/components/copy-button/copy-button';
import { SaveTextFile } from '../../shared/components/save-text-file/save-text-file';
import { PlatformService } from '../../core/platform/platform.service';
import { PersistenceService } from '../../core/persistence/persistence.service';
import { FsJobService, type FsJobHandle } from '../../core/platform/fs-job.service';
import { FsSnapshotService } from '../../core/platform/fs-snapshot.service';
import { downloadFile } from '../../shared/utils/download-file';

const TOOL_ID = 'hash-manifest';
type Tab = 'manifest' | 'verify' | 'snapshots';
type OutputFormat = 'gnu' | 'bsd' | 'json' | 'csv';
type VerifyStatus = 'ok' | 'mismatch' | 'missing' | 'error' | 'unsupported' | 'extra';
interface VerifyItem { readonly path: string; readonly status: VerifyStatus; readonly algorithm?: string; readonly expected?: string; readonly actual?: string; readonly message?: string }
interface ManifestResult { readonly algorithms: HashAlgorithm[]; readonly files: number; readonly dirs: number; readonly failed: number; readonly bytes: number; readonly directoryHash: string | null; readonly folderHashes: [string, string][] }

/**
 * Hash Manifest & Snapshot (DUDE_PRD.md §21 Phase 29 items 9, 15, 16; Milestone 527): streaming
 * bulk hashes of a whole folder in `sha256sum`/BSD-tag/JSON/CSV form, a deterministic Merkle
 * directory hash for comparing trees, manifest verification, and a local snapshot library diffed
 * against other snapshots or a live rescan. Read-only: it never writes into the hashed folder.
 */
@Component({
  selector: 'app-hash-manifest',
  imports: [ToolShell, DesktopOnlyControl, FsRootPicker, WalkOptionsPanel, ScanProgress, CopyButton, SaveTextFile, ScrollingModule],
  templateUrl: './hash-manifest.html',
})
export class HashManifestTool {
  protected readonly platform = inject(PlatformService);
  private readonly jobs = inject(FsJobService);
  protected readonly library = inject(FsSnapshotService);
  private readonly persistence = inject(PersistenceService);

  protected readonly algorithmsList = HASH_ALGORITHMS;
  protected readonly merkleDescription = MERKLE_DESCRIPTION;
  protected readonly bytes = formatBytes;
  protected readonly tab = this.persistence.signal<Tab>(TOOL_ID, 'tab', 'local', 'manifest');
  protected readonly options = this.persistence.signal<WalkOptions>(TOOL_ID, 'walkOptions', 'local', { ...DEFAULT_WALK_OPTIONS, useGitignore: false });
  protected readonly algorithms = this.persistence.signal<HashAlgorithm[]>(TOOL_ID, 'algorithms', 'local', ['SHA-256']);
  protected readonly format = this.persistence.signal<OutputFormat>(TOOL_ID, 'format', 'local', 'gnu');
  protected readonly gnuAlgorithm = this.persistence.signal<HashAlgorithm>(TOOL_ID, 'gnuAlgorithm', 'local', 'SHA-256');
  protected readonly root = signal('');
  protected readonly error = signal('');

  // ---- Manifest ----
  protected readonly manifestJob = signal<FsJobHandle<ManifestResult> | null>(null);
  protected readonly entries = signal<readonly ManifestEntry[]>([]);
  protected readonly manifest = signal<ManifestResult | null>(null);
  protected readonly folderFilter = signal('');
  protected readonly output = computed(() => {
    const entries = [...this.entries()].sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));
    const algorithms = this.manifest()?.algorithms ?? this.algorithms();
    if (!entries.length) return '';
    switch (this.format()) {
      case 'gnu': return formatGnu(entries, algorithms.includes(this.gnuAlgorithm()) ? this.gnuAlgorithm() : algorithms[0]);
      case 'bsd': return formatBsd(entries, algorithms);
      case 'json': return formatJson(entries, { root: this.root(), generatedAt: new Date().toISOString(), directoryHash: this.manifest()?.directoryHash ?? null });
      case 'csv': return formatCsv(entries, algorithms);
    }
  });
  protected readonly outputName = computed(() => ({ gnu: `${(this.gnuAlgorithm().replace('-', '').toUpperCase())}SUMS`, bsd: 'CHECKSUMS', json: 'manifest.json', csv: 'manifest.csv' })[this.format()]);
  protected readonly folderHashes = computed(() => {
    const query = this.folderFilter().trim().toLowerCase();
    const list = this.manifest()?.folderHashes ?? [];
    return (query ? list.filter(([path]) => path.toLowerCase().includes(query)) : list).slice(0, 500);
  });

  // ---- Verify ----
  protected readonly verifyText = signal('');
  protected readonly verifyAlgorithm = signal<HashAlgorithm | ''>('');
  protected readonly reportExtra = signal(true);
  protected readonly verifyJob = signal<FsJobHandle<{ counts: Record<VerifyStatus, number> }> | null>(null);
  protected readonly verifyItems = signal<readonly VerifyItem[]>([]);
  protected readonly verifyCounts = signal<Record<VerifyStatus, number> | null>(null);
  protected readonly verifyFilter = signal<VerifyStatus | 'problems' | 'all'>('problems');
  protected readonly parsed = computed(() => (this.verifyText().trim() ? parseManifest(this.verifyText(), this.verifyAlgorithm() || null) : null));
  protected readonly shownVerify = computed(() => {
    const filter = this.verifyFilter();
    const items = this.verifyItems();
    return filter === 'all' ? items : filter === 'problems' ? items.filter((item) => item.status !== 'ok') : items.filter((item) => item.status === filter);
  });

  // ---- Snapshots ----
  protected readonly snapshotAlgorithm = this.persistence.signal<HashAlgorithm | ''>(TOOL_ID, 'snapshotAlgorithm', 'local', 'SHA-256');
  protected readonly snapshotLabel = signal('');
  protected readonly snapshotJob = signal<FsJobHandle<{ header: SnapshotHeader }> | null>(null);
  protected readonly baseId = signal('');
  protected readonly compareId = signal('live');
  protected readonly deleting = signal('');
  protected readonly diffJob = signal<FsJobHandle<unknown> | null>(null);
  protected readonly diffItems = signal<readonly SnapshotDiffItem[]>([]);
  protected readonly diffCounts = signal<Record<SnapshotChange | 'unchanged', number> | null>(null);
  protected readonly diffDirs = signal<{ added: readonly string[]; removed: readonly string[] }>({ added: [], removed: [] });
  protected readonly diffFilter = signal<SnapshotChange | 'all'>('all');
  protected readonly baseSnapshot = computed(() => this.library.snapshots().find((snapshot) => snapshot.id === this.baseId()) ?? null);
  protected readonly shownDiff = computed(() => (this.diffFilter() === 'all' ? this.diffItems() : this.diffItems().filter((item) => item.change === this.diffFilter())));
  protected readonly changes: readonly SnapshotChange[] = ['added', 'removed', 'modified', 'moved', 'touched'];

  constructor() {
    if (this.platform.isDesktop()) void this.library.refresh().catch(() => {});
  }

  protected toggleAlgorithm(algorithm: HashAlgorithm, event: Event): void {
    const checked = (event.target as HTMLInputElement).checked;
    this.algorithms.update((list) => (checked ? [...new Set([...list, algorithm])] : list.filter((item) => item !== algorithm)));
  }

  protected generate(): void {
    if (!this.root() || !this.algorithms().length) return;
    const collected: ManifestEntry[] = [];
    this.entries.set([]);
    this.manifest.set(null);
    const job = this.jobs.run<ManifestResult, ManifestEntry>({ kind: 'hash-manifest', root: this.root(), params: { options: this.options(), algorithms: this.algorithms() } }, (items) => collected.push(...items));
    this.manifestJob.set(job);
    job.result.then((result) => { this.entries.set(collected); this.manifest.set(result); if (!result.algorithms.includes(this.gnuAlgorithm())) this.gnuAlgorithm.set(result.algorithms[0]); }, () => {});
  }

  protected async loadManifestFile(event: Event): Promise<void> {
    const file = (event.target as HTMLInputElement).files?.[0];
    if (file) this.verifyText.set(await file.text());
  }

  protected verify(): void {
    const parsed = this.parsed();
    if (!this.root() || !parsed?.entries.length) return;
    const collected: VerifyItem[] = [];
    this.verifyItems.set([]);
    this.verifyCounts.set(null);
    const job = this.jobs.run<{ counts: Record<VerifyStatus, number> }, VerifyItem>({ kind: 'verify-manifest', root: this.root(), params: { entries: parsed.entries, reportExtra: this.reportExtra(), options: this.options() } }, (items) => collected.push(...items));
    this.verifyJob.set(job);
    job.result.then((result) => { this.verifyItems.set(collected); this.verifyCounts.set(result.counts); }, () => {});
  }

  protected takeSnapshot(): void {
    if (!this.root()) return;
    const job = this.jobs.run<{ header: SnapshotHeader }>({ kind: 'snapshot-take', root: this.root(), params: { options: this.options(), algorithm: this.snapshotAlgorithm() || null, label: this.snapshotLabel() } });
    this.snapshotJob.set(job);
    job.result.then(async (result) => { this.snapshotLabel.set(''); await this.library.refresh(); this.baseId.set(result.header.id); }, () => {});
  }

  protected async exportSnapshot(snapshot: SnapshotHeader): Promise<void> {
    try { downloadFile(new Blob([await this.library.exportJson(snapshot.id)], { type: 'application/json' }), `snapshot-${snapshot.takenAt.slice(0, 10)}.json`); }
    catch (caught) { this.error.set(caught instanceof Error ? caught.message : String(caught)); }
  }

  protected async importSnapshot(event: Event): Promise<void> {
    const file = (event.target as HTMLInputElement).files?.[0];
    if (!file) return;
    try { await this.library.importJson(await file.text()); } catch (caught) { this.error.set(caught instanceof Error ? caught.message : String(caught)); }
  }

  protected async deleteSnapshot(id: string): Promise<void> {
    await this.library.remove(id);
    this.deleting.set('');
    if (this.baseId() === id) this.baseId.set('');
  }

  protected async compare(): Promise<void> {
    const base = this.baseSnapshot();
    if (!base) return;
    this.error.set('');
    this.diffItems.set([]);
    this.diffCounts.set(null);
    if (this.compareId() !== 'live') {
      try {
        const diff = await this.library.compare(base.id, this.compareId());
        this.diffItems.set(diff.items);
        this.diffCounts.set(diff.counts);
        this.diffDirs.set({ added: diff.addedDirs, removed: diff.removedDirs });
      } catch (caught) { this.error.set(caught instanceof Error ? caught.message : String(caught)); }
      return;
    }
    const collected: SnapshotDiffItem[] = [];
    const job = this.jobs.run<{ counts: Record<SnapshotChange | 'unchanged', number>; addedDirs: string[]; removedDirs: string[] }, SnapshotDiffItem>({ kind: 'snapshot-live-diff', root: base.root, params: { baseId: base.id, options: this.options() } }, (items) => collected.push(...items));
    this.diffJob.set(job);
    job.result.then((result) => { this.diffItems.set(collected); this.diffCounts.set(result.counts); this.diffDirs.set({ added: result.addedDirs, removed: result.removedDirs }); }, () => {});
  }

  protected digestsOf(entry: ManifestEntry): string { return (this.manifest()?.algorithms ?? []).map((algorithm) => entry.digests[algorithm] ?? '').join('  '); }
  protected trackEntry(_index: number, entry: ManifestEntry): string { return entry.path; }
  protected checked(event: Event): boolean { return (event.target as HTMLInputElement).checked; }
}
