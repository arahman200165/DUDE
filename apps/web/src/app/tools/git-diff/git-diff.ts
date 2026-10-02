import { LINE_CLASSES, LINE_PREFIX, GitDiff_lineClasses, GitDiff_linePrefix } from "@dude/tool-engine/tools/git-diff/git-diff.embedded-engine";
import { Component, ElementRef, OnDestroy, effect, inject, signal, viewChild } from '@angular/core';
import type { FsClient } from 'isomorphic-git';
import { ToolShell } from '../../shared/components/tool-shell/tool-shell';
import { DesktopOnlyControl } from '../../shared/components/desktop-only-control/desktop-only-control';
import { BusyIndicator } from '../../shared/components/busy-indicator/busy-indicator';
import { ErrorPanel } from '../../shared/components/error-panel/error-panel';
import { PlatformService } from '../../core/platform/platform.service';
import { NativeFsService } from '../../core/platform/native-fs.service';
import { FileWatchService } from '../../core/platform/file-watch.service';
import { PersistenceService } from '../../core/persistence/persistence.service';
import { DiffLineType, DiffResult } from "@dude/tool-engine/tools/diff/text-diff";
import { scanFileList } from "@dude/tool-engine/tools/directory-diff/directory-tree-scan";
import { buildInMemoryFs } from "@dude/tool-engine/tools/git-diff/git-fs-shim";
import { toInMemoryRepoFiles } from "@dude/tool-engine/tools/git-diff/git-web-files";
import { buildNativeFsClient } from './git-native-fs-client';
import { CommitSummary, diffCommitFiles, diffFileContent, FileChange, listCommits } from "@dude/tool-engine/tools/git-diff/git-diff-service";



/**
 * Browses/diffs a local repository's commit history entirely client-side via
 * `isomorphic-git`. In the web build, an entire `.git` folder is read into
 * memory (via `<input webkitdirectory>`) against the read-only in-memory
 * `fs` shim in `git-fs-shim.ts`. In the desktop build, a native folder
 * picker plus a lazy IPC-backed `fs` client (`git-native-fs-client.ts`)
 * reads the repository on demand, live, with a "Refresh" action. Never
 * persists anything — a `.git` folder can contain an entire private
 * codebase.
 */
@Component({
  selector: 'app-git-diff',
  imports: [ToolShell, DesktopOnlyControl, BusyIndicator, ErrorPanel],
  templateUrl: './git-diff.html',
})
export class GitDiff implements OnDestroy {
  private readonly nativeFs = inject(NativeFsService);
  private readonly fileWatch = inject(FileWatchService);
  private readonly persistence = inject(PersistenceService);
  protected readonly autoRefresh = this.persistence.signal('git-diff', 'autoRefresh', 'local', false);
  protected readonly refreshedCount = signal(0);
  protected readonly selectedFileChanged = signal(false);
  private readonly changeList = viewChild<ElementRef<HTMLUListElement>>('changeList');
  private listScrollTop = 0;
  private watchId: string | null = null;
  private watchRoot: string | null = null;
  private watchEpoch = 0;
  private watchTimer: ReturnType<typeof setTimeout> | null = null;
  private readonly dirtyPaths = new Set<string>();
  private unsubscribeWatch: (() => void) | null = null;
  private refreshing = false;
  private hasCompared = false;
  protected readonly platform = inject(PlatformService);

  constructor() {
    this.unsubscribeWatch = this.fileWatch.onEvent((event) => {
      if (event.id !== this.watchId) return;
      if (event.kind === 'error') { this.loadError.set(event.error); return; }
      this.dirtyPaths.add(event.relativePath ?? '*');
      if (this.watchTimer) clearTimeout(this.watchTimer);
      this.watchTimer = setTimeout(() => void this.flushWatchChanges(), 750);
    });
    effect(() => {
      if (this.changes().length > 0) queueMicrotask(() => {
        const list = this.changeList()?.nativeElement;
        if (list) list.scrollTop = this.listScrollTop;
      });
    });
  }

  private fs: FsClient | null = null;
  private nativeRootPath: string | null = null;

  protected readonly repoName = signal('');
  protected readonly loadStatus = signal<'idle' | 'loading' | 'error'>('idle');
  protected readonly loadError = signal('');
  protected readonly commits = signal<readonly CommitSummary[]>([]);

  protected readonly fromOid = signal('');
  protected readonly toOid = signal('');

  protected readonly diffStatus = signal<'idle' | 'loading' | 'error'>('idle');
  protected readonly diffError = signal('');
  protected readonly changes = signal<readonly FileChange[]>([]);

  protected readonly selectedPath = signal<string | null>(null);
  protected readonly fileDiff = signal<DiffResult | null>(null);
  protected readonly fileDiffStatus = signal<'idle' | 'loading'>('idle');

  protected async onFolderSelected(event: Event): Promise<void> {
    const input = event.target as HTMLInputElement;
    if (!input.files || input.files.length === 0) return;

    this.clear();
    this.loadStatus.set('loading');

    this.repoName.set(input.files[0].webkitRelativePath.split('/')[0] ?? '');

    try {
      this.fs = buildInMemoryFs(await toInMemoryRepoFiles(scanFileList(input.files)));
      await this.loadCommits();
    } catch (error) {
      this.loadError.set(error instanceof Error ? error.message : 'Could not read this folder as a git repository.');
      this.loadStatus.set('error');
    }
  }

  protected async pickRepositoryNative(): Promise<void> {
    this.clear();
    this.loadStatus.set('loading');

    try {
      const picked = await this.nativeFs.pickDirectory();
      if (picked.canceled) {
        this.loadStatus.set('idle');
        return;
      }

      const gitDirStat = await this.nativeFs.stat(picked.rootPath, '.git', true).catch(() => null);
      if (!gitDirStat || !gitDirStat.isDirectory) {
        throw new Error('No .git folder found in the selected folder — select a folder containing a git repository.');
      }

      this.repoName.set(picked.rootName);
      this.nativeRootPath = picked.rootPath;
      this.fs = buildNativeFsClient(this.nativeFs, picked.rootPath);
      await this.loadCommits();
      await this.syncWatch();
    } catch (error) {
      this.loadError.set(error instanceof Error ? error.message : 'Could not read this folder as a git repository.');
      this.loadStatus.set('error');
    }
  }

  protected async refreshCommits(): Promise<void> {
    if (!this.fs || !this.nativeRootPath) return;
    this.loadStatus.set('loading');
    try {
      await this.loadCommits(true);
    } catch (error) {
      this.loadError.set(error instanceof Error ? error.message : 'Could not refresh commits.');
      this.loadStatus.set('error');
    }
  }

  private async loadCommits(preserveSelection = false): Promise<void> {
    if (!this.fs) return;
    const commits = await listCommits(this.fs, '/', 'HEAD', 200);
    this.commits.set(commits);

    if (preserveSelection) {
      const oids = new Set(commits.map((commit) => commit.oid));
      if (oids.has(this.fromOid()) && oids.has(this.toOid())) { this.loadStatus.set('idle'); return; }
    }
    if (commits.length > 0) this.toOid.set(commits[0].oid);
    if (commits.length > 1) this.fromOid.set(commits[1].oid);
    else if (commits.length === 1) this.fromOid.set(commits[0].oid);

    this.loadStatus.set('idle');
  }

  protected toggleAutoRefresh(event: Event): void {
    this.autoRefresh.set((event.target as HTMLInputElement).checked);
    void this.syncWatch();
  }

  protected rememberScroll(event: Event): void {
    this.listScrollTop = (event.target as HTMLUListElement).scrollTop;
  }

  private async stopWatch(): Promise<void> {
    this.watchEpoch++;
    const id = this.watchId;
    this.watchId = null;
    this.watchRoot = null;
    if (id) await this.fileWatch.unwatch(id);
  }

  private async syncWatch(): Promise<void> {
    if (this.autoRefresh() && this.watchId && this.watchRoot === this.nativeRootPath) return;
    await this.stopWatch();
    if (!this.autoRefresh() || !this.nativeRootPath || !this.platform.isDesktop()) return;
    const epoch = this.watchEpoch;
    try {
      // A recursive worktree watch includes .git/HEAD, .git/refs and .git/index.
      const id = await this.fileWatch.watch(this.nativeRootPath, '.', true);
      if (epoch !== this.watchEpoch || !this.autoRefresh()) { await this.fileWatch.unwatch(id); return; }
      this.watchId = id;
      this.watchRoot = this.nativeRootPath;
    } catch (error) {
      this.loadError.set(error instanceof Error ? error.message : 'Could not watch this repository.');
    }
  }

  private async flushWatchChanges(): Promise<void> {
    this.watchTimer = null;
    if (this.refreshing || this.dirtyPaths.size === 0 || !this.nativeRootPath) return;
    this.refreshing = true;
    const paths = [...this.dirtyPaths];
    this.dirtyPaths.clear();
    try {
      await this.refreshCommits();
      this.refreshedCount.set(paths.length);
      if (this.selectedPath() && (paths.includes('*') || paths.includes(this.selectedPath()!) || paths.some((path) => path.startsWith('.git/')))) this.selectedFileChanged.set(true);
      if (this.hasCompared) await this.compare(true);
    } finally {
      this.refreshing = false;
      if (this.dirtyPaths.size && !this.watchTimer) this.watchTimer = setTimeout(() => void this.flushWatchChanges(), 750);
    }
  }

  protected async reloadSelectedFile(): Promise<void> {
    const change = this.changes().find((item) => item.path === this.selectedPath());
    if (change) await this.inspect(change);
    this.selectedFileChanged.set(false);
  }

  protected onFromChange(event: Event): void {
    this.fromOid.set((event.target as HTMLSelectElement).value);
  }

  protected onToChange(event: Event): void {
    this.toOid.set((event.target as HTMLSelectElement).value);
  }

  protected async compare(preserveSelection = false): Promise<void> {
    if (!this.fs || !this.fromOid() || !this.toOid()) return;

    this.diffStatus.set('loading');
    this.diffError.set('');
    if (!preserveSelection) {
      this.selectedPath.set(null);
      this.fileDiff.set(null);
      this.selectedFileChanged.set(false);
      this.listScrollTop = 0;
    }

    try {
      this.changes.set(await diffCommitFiles(this.fs, '/', this.fromOid(), this.toOid()));
      this.hasCompared = true;
      this.diffStatus.set('idle');
    } catch (error) {
      this.diffError.set(error instanceof Error ? error.message : 'Could not diff these commits.');
      this.diffStatus.set('error');
    }
  }

  protected async inspect(change: FileChange): Promise<void> {
    if (!this.fs) return;
    this.selectedPath.set(change.path);
    this.selectedFileChanged.set(false);
    this.fileDiffStatus.set('loading');
    this.fileDiff.set(await diffFileContent(this.fs, '/', this.fromOid(), this.toOid(), change.path));
    this.fileDiffStatus.set('idle');
  }
  protected lineClasses = GitDiff_lineClasses;

  protected linePrefix = GitDiff_linePrefix;


  protected clear(): void {
    void this.stopWatch();
    if (this.watchTimer) clearTimeout(this.watchTimer);
    this.watchTimer = null;
    this.dirtyPaths.clear();
    this.refreshedCount.set(0);
    this.selectedFileChanged.set(false);
    this.hasCompared = false;
    this.fs = null;
    this.nativeRootPath = null;
    this.repoName.set('');
    this.commits.set([]);
    this.fromOid.set('');
    this.toOid.set('');
    this.changes.set([]);
    this.selectedPath.set(null);
    this.fileDiff.set(null);
    this.listScrollTop = 0;
    this.loadStatus.set('idle');
    this.loadError.set('');
    this.diffStatus.set('idle');
    this.diffError.set('');
  }

  ngOnDestroy(): void {
    void this.stopWatch();
    if (this.watchTimer) clearTimeout(this.watchTimer);
    this.unsubscribeWatch?.();
  }
}
