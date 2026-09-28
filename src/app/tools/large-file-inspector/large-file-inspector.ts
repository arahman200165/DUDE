import { Component, DestroyRef, computed, inject, signal } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { HASH_ALGORITHMS, type HashAlgorithm } from '../../../shared-logic/hash-compute';
import { formatBytes } from '../../../shared-logic/fs/format-size';
import { ToolShell } from '../../shared/components/tool-shell/tool-shell';
import { DesktopOnlyControl } from '../../shared/components/desktop-only-control/desktop-only-control';
import { FsRootPicker, type PickedRoot } from '../../shared/components/fs-root-picker/fs-root-picker';
import { ScanProgress } from '../../shared/components/scan-progress/scan-progress';
import { CopyButton } from '../../shared/components/copy-button/copy-button';
import { PlatformService } from '../../core/platform/platform.service';
import { PersistenceService } from '../../core/persistence/persistence.service';
import { NativeFsService } from '../../core/platform/native-fs.service';
import { FsJobService, type FsJobHandle } from '../../core/platform/fs-job.service';
import { FileWatchService } from '../../core/platform/file-watch.service';
import { downloadFile } from '../../shared/utils/download-file';
import { alignRow, BYTES_PER_ROW, formatOffset, hexRows, locateLine, parseOffset, splitChunk, type HexRow, type LineIndex } from './inspector-logic';

const TOOL_ID = 'large-file-inspector';
const HEX_ROWS = 32;
const TEXT_LINES = 40;
const TEXT_READ = 1024 * 1024;
const TAIL_READ = 256 * 1024;
const MAX_EXPORT = 256 * 1024 * 1024;
type View = 'hex' | 'text';
interface TextFind { readonly line: number; readonly column: number; readonly offset: number; readonly length: number; readonly text: string; readonly textColumn: number }
interface HexFind { readonly offset: number; readonly length: number }

/**
 * Large-File Streaming Inspector (DUDE_PRD.md §21 Phase 29 item 14, Milestone 533): open a file of
 * any size on disk — logs, dumps, disk images — without loading it. A hex view pages through ranged
 * reads; a text view pages by line number through a background sparse line index; find streams
 * text/regex or byte-pattern matches; follow mode tails the file as it grows. Read-only, and
 * distinct from Phase 20's upload-based single-file inspectors.
 */
@Component({
  selector: 'app-large-file-inspector',
  imports: [ToolShell, DesktopOnlyControl, FsRootPicker, ScanProgress, CopyButton],
  templateUrl: './large-file-inspector.html',
})
export class LargeFileInspectorTool {
  protected readonly platform = inject(PlatformService);
  private readonly nativeFs = inject(NativeFsService);
  private readonly jobs = inject(FsJobService);
  private readonly watcher = inject(FileWatchService);
  private readonly persistence = inject(PersistenceService);
  private readonly destroyRef = inject(DestroyRef);

  protected readonly bytes = formatBytes;
  protected readonly formatOffset = formatOffset;
  protected readonly algorithms = HASH_ALGORITHMS;
  protected readonly view = this.persistence.signal<View>(TOOL_ID, 'view', 'local', 'hex');
  protected readonly pickedFile = signal('');
  protected readonly root = signal('');
  protected readonly path = signal('');
  protected readonly name = signal('');
  protected readonly size = signal(0);
  protected readonly error = signal('');

  protected readonly offset = signal(0);
  protected readonly rows = signal<readonly HexRow[]>([]);
  protected readonly highlight = signal<{ offset: number; length: number } | null>(null);
  protected readonly jump = signal('');

  protected readonly indexJob = signal<FsJobHandle<LineIndex> | null>(null);
  protected readonly lineIndex = signal<LineIndex | null>(null);
  protected readonly line = signal(1);
  protected readonly lines = signal<readonly { number: number; text: string }[]>([]);
  protected readonly following = signal(false);

  protected readonly findPattern = signal('');
  protected readonly findHex = signal(false);
  protected readonly findRegex = signal(false);
  protected readonly findCase = signal(false);
  protected readonly findJob = signal<FsJobHandle<{ found: number; truncated: boolean }> | null>(null);
  protected readonly textFinds = signal<readonly TextFind[]>([]);
  protected readonly hexFinds = signal<readonly HexFind[]>([]);

  protected readonly rangeStart = signal('0');
  protected readonly rangeEnd = signal('');
  protected readonly hashAlgorithm = signal<HashAlgorithm>('SHA-256');
  protected readonly hashJob = signal<FsJobHandle<{ digests: Record<string, string>; bytes: number }> | null>(null);
  protected readonly rangeHash = signal('');

  protected readonly opened = computed(() => !!this.root());
  protected readonly percent = computed(() => (this.size() ? Math.min(100, (this.offset() / this.size()) * 100) : 0));
  protected readonly range = computed(() => {
    const start = parseOffset(this.rangeStart() || '0', this.size() + 1) ?? 0;
    const endRaw = this.rangeEnd().trim();
    const end = endRaw ? Math.min(this.size(), (parseOffset(endRaw, this.size() + 1) ?? this.size())) : this.size();
    return { start, end: Math.max(start, end) };
  });

  private watchId: string | null = null;
  private unsubscribe: (() => void) | null = null;
  private decoder = new TextDecoder('utf-8');

  constructor() {
    const query = inject(ActivatedRoute).snapshot.queryParamMap;
    const root = query.get('root');
    const path = query.get('path');
    if (root && path && this.platform.isDesktop()) {
      void this.open(root, path, path.slice(path.lastIndexOf('/') + 1)).then(() => {
        const line = Number(query.get('line'));
        if (line > 0) { this.view.set('text'); void this.ensureIndex().then(() => this.goLine(line)); }
      });
    }
    this.destroyRef.onDestroy(() => void this.stopFollow());
  }

  protected picked(file: PickedRoot): void { void this.open(file.path, '', file.name); }

  private async open(root: string, path: string, name: string): Promise<void> {
    this.error.set('');
    await this.stopFollow();
    this.root.set(root);
    this.path.set(path);
    this.name.set(name);
    this.lineIndex.set(null);
    this.textFinds.set([]);
    this.hexFinds.set([]);
    this.rangeHash.set('');
    this.highlight.set(null);
    try {
      const probe = await this.nativeFs.readRange(root, path, 0, 0);
      this.size.set(probe.size);
      this.rangeEnd.set('');
      await this.loadHex(0);
      if (this.view() === 'text') { await this.ensureIndex(); await this.goLine(1); }
    } catch (caught) { this.error.set(caught instanceof Error ? caught.message : String(caught)); this.root.set(''); }
  }

  // ---- Hex ----
  protected async loadHex(offset: number): Promise<void> {
    const size = this.size();
    const start = alignRow(Math.max(0, Math.min(offset, Math.max(0, size - HEX_ROWS * BYTES_PER_ROW))));
    const { data } = await this.nativeFs.readRange(this.root(), this.path(), start, HEX_ROWS * BYTES_PER_ROW);
    this.offset.set(start);
    this.rows.set(hexRows(new Uint8Array(data), start));
  }

  protected page(direction: number): void {
    if (this.view() === 'hex') void this.loadHex(this.offset() + direction * HEX_ROWS * BYTES_PER_ROW);
    else void this.goLine(this.line() + direction * TEXT_LINES);
  }

  protected wheel(event: WheelEvent): void {
    event.preventDefault();
    const rows = Math.sign(event.deltaY) * 3;
    if (this.view() === 'hex') void this.loadHex(this.offset() + rows * BYTES_PER_ROW);
    else void this.goLine(this.line() + rows);
  }

  protected scrub(event: Event): void {
    const fraction = Number((event.target as HTMLInputElement).value) / 1000;
    if (this.view() === 'hex') void this.loadHex(Math.round(fraction * this.size()));
    else void this.goLine(Math.max(1, Math.round(fraction * (this.lineIndex()?.lines ?? 1))));
  }

  protected goJump(): void {
    const value = this.jump().trim();
    if (this.view() === 'text' && /^L?\d+$/i.test(value)) { void this.goLine(Number(value.replace(/^L/i, ''))); return; }
    const offset = parseOffset(value, this.size());
    if (offset === null) { this.error.set('Enter an offset (0x1F4, 1024, 512MiB, 50%) — or a line number in text view.'); return; }
    this.error.set('');
    this.view.set('hex');
    this.highlight.set({ offset, length: 1 });
    void this.loadHex(offset - 4 * BYTES_PER_ROW);
  }

  protected isHighlighted(row: HexRow, column: number): boolean {
    const mark = this.highlight();
    const position = row.offset + column;
    return !!mark && position >= mark.offset && position < mark.offset + mark.length;
  }

  // ---- Text ----
  protected async showText(): Promise<void> {
    this.view.set('text');
    await this.ensureIndex();
    await this.goLine(this.line());
  }

  private async ensureIndex(): Promise<void> {
    if (this.lineIndex()) return;
    const job = this.jobs.run<LineIndex>({ kind: 'line-index', root: this.root(), params: { path: this.path() } });
    this.indexJob.set(job);
    try { this.lineIndex.set(await job.result); } catch { /* shown by scan-progress */ }
  }

  protected async goLine(line: number): Promise<void> {
    const index = this.lineIndex();
    if (!index) return;
    this.following.set(false);
    const target = Math.max(1, Math.min(line, Math.max(1, index.lines - TEXT_LINES + 1)));
    const { offset, skip } = locateLine(index, target);
    const { data } = await this.nativeFs.readRange(this.root(), this.path(), offset, TEXT_READ);
    const atEof = offset + data.byteLength >= index.size;
    const all = splitChunk(this.decoder.decode(data), atEof);
    this.line.set(target);
    this.lines.set(all.slice(skip, skip + TEXT_LINES).map((text, position) => ({ number: target + position, text: text.length > 2000 ? `${text.slice(0, 2000)}…` : text })));
  }

  // ---- Follow (tail -f) ----
  protected async toggleFollow(): Promise<void> {
    if (this.following()) { await this.stopFollow(); return; }
    this.view.set('text');
    this.following.set(true);
    await this.showTail();
    try {
      this.watchId = await this.watcher.watch(this.root(), this.path());
      this.unsubscribe = this.watcher.onEvent((event) => { if (event.id === this.watchId && event.kind === 'changed') void this.showTail(); });
    } catch (caught) { this.error.set(caught instanceof Error ? caught.message : String(caught)); this.following.set(false); }
  }

  private tailPending = false;
  private async showTail(): Promise<void> {
    if (this.tailPending) return;
    this.tailPending = true;
    try {
      const probe = await this.nativeFs.readRange(this.root(), this.path(), 0, 0);
      this.size.set(probe.size);
      const start = Math.max(0, probe.size - TAIL_READ);
      const { data } = await this.nativeFs.readRange(this.root(), this.path(), start, TAIL_READ);
      const all = splitChunk(this.decoder.decode(data), true);
      const shown = (start > 0 ? all.slice(1) : all).slice(-TEXT_LINES);
      this.lines.set(shown.map((text, position) => ({ number: -(shown.length - position), text })));
      this.lineIndex.set(null);
    } finally { this.tailPending = false; }
  }

  private async stopFollow(): Promise<void> {
    this.following.set(false);
    this.unsubscribe?.();
    this.unsubscribe = null;
    if (this.watchId) { await this.watcher.unwatch(this.watchId).catch(() => {}); this.watchId = null; }
  }

  // ---- Find ----
  protected find(): void {
    if (!this.findPattern()) return;
    this.error.set('');
    const textFinds: TextFind[] = [];
    const hexFinds: HexFind[] = [];
    this.textFinds.set([]);
    this.hexFinds.set([]);
    const hex = this.findHex();
    const job = this.jobs.run<{ found: number; truncated: boolean }, TextFind | HexFind>(
      { kind: 'find-in-file', root: this.root(), params: { path: this.path(), pattern: this.findPattern(), mode: hex ? 'hex' : 'text', regex: this.findRegex(), caseSensitive: this.findCase(), maxResults: 2000 } },
      (items) => { if (hex) hexFinds.push(...(items as HexFind[])); else textFinds.push(...(items as TextFind[])); this.hexFinds.set([...hexFinds]); this.textFinds.set([...textFinds]); },
    );
    this.findJob.set(job);
    job.result.catch((caught: Error) => this.error.set(caught.message));
  }

  protected openHexFind(find: HexFind): void {
    this.view.set('hex');
    this.highlight.set(find);
    void this.loadHex(find.offset - 4 * BYTES_PER_ROW);
  }

  protected async openTextFind(find: TextFind): Promise<void> {
    this.view.set('text');
    await this.ensureIndex();
    await this.goLine(Math.max(1, find.line - 5));
  }

  // ---- Range hash / export ----
  protected hashRange(): void {
    const { start, end } = this.range();
    if (end <= start) return;
    this.rangeHash.set('');
    const job = this.jobs.run<{ digests: Record<string, string>; bytes: number }>({ kind: 'hash-file', root: this.root(), params: { path: this.path(), algorithms: [this.hashAlgorithm()], start, end: end - 1 } });
    this.hashJob.set(job);
    job.result.then((result) => this.rangeHash.set(result.digests[this.hashAlgorithm()]), () => {});
  }

  protected async exportRange(): Promise<void> {
    const { start, end } = this.range();
    if (end <= start) return;
    if (end - start > MAX_EXPORT) { this.error.set(`Ranges over ${formatBytes(MAX_EXPORT)} can't be downloaded in one go — use File Split & Join to cut the file instead.`); return; }
    const chunks: ArrayBuffer[] = [];
    for (let position = start; position < end; position += 1024 * 1024) {
      chunks.push((await this.nativeFs.readRange(this.root(), this.path(), position, Math.min(1024 * 1024, end - position))).data);
    }
    downloadFile(new Blob(chunks), `${this.name() || 'range'}.${start}-${end}.bin`);
  }

  protected useView(): void {
    if (this.view() === 'hex') { this.rangeStart.set(String(this.offset())); this.rangeEnd.set(String(Math.min(this.size(), this.offset() + HEX_ROWS * BYTES_PER_ROW))); }
  }

  protected value(event: Event): string { return (event.target as HTMLInputElement).value; }
  protected checked(event: Event): boolean { return (event.target as HTMLInputElement).checked; }
  protected segments(find: TextFind): { before: string; hit: string; after: string } {
    return { before: find.text.slice(0, find.textColumn), hit: find.text.slice(find.textColumn, find.textColumn + Math.max(1, find.length)), after: find.text.slice(find.textColumn + Math.max(1, find.length)) };
  }
}
