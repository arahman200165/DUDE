import { WatchedFoldersTool_delta, WatchedFoldersTool_time, WatchedFoldersTool_kindClass } from "@dude/tool-engine/tools/watched-folders/watched-folders.embedded-engine";
import { Component, computed, effect, inject, signal } from '@angular/core';
import type { ChangeEvent, ChangeKind, WatchedFolderStatus } from "@dude/contracts/fs/watch-types";
import { formatBytes } from "@dude/tool-engine/shared/fs/format-size";
import { ToolShell } from '../../shared/components/tool-shell/tool-shell';
import { DesktopOnlyControl } from '../../shared/components/desktop-only-control/desktop-only-control';
import { FsRootPicker } from '../../shared/components/fs-root-picker/fs-root-picker';
import { PlatformService } from '../../core/platform/platform.service';
import { FolderWatchService } from '../../core/platform/folder-watch.service';
import { RememberedFoldersService } from '../../core/platform/remembered-folders.service';
import { downloadFile } from '../../shared/utils/download-file';
import { computeLineDiff, type DiffLine } from "@dude/tool-engine/tools/diff/text-diff";
import { describeEvent, groupByDay, signedBytes, timelineToCsv } from "@dude/tool-engine/tools/watched-folders/timeline-logic";

const KINDS: readonly ChangeKind[] = ['created', 'modified', 'deleted', 'renamed', 'dude', 'gap'];

/**
 * Watched Folders & Change Timeline (DUDE_PRD.md §21 Phase 29 items 10 and 13, Milestone 534):
 * background watching of remembered folders while DUDE runs, a searchable per-folder timeline of
 * created/modified/deleted/renamed files (DUDE's own batch operations tagged, not alerted), optional
 * rate-limited notifications, and opt-in content capture with before/after diffs.
 */
@Component({
  selector: 'app-watched-folders',
  imports: [ToolShell, DesktopOnlyControl, FsRootPicker],
  templateUrl: './watched-folders.html',
})
export class WatchedFoldersTool {
  protected readonly platform = inject(PlatformService);
  protected readonly watch = inject(FolderWatchService);
  private readonly remembered = inject(RememberedFoldersService);

  protected readonly bytes = formatBytes;
  protected readonly kinds = KINDS;
  protected readonly describe = describeEvent;
  protected readonly root = signal('');
  protected readonly selectedId = signal('');
  protected readonly kindFilter = signal<ReadonlySet<ChangeKind>>(new Set(KINDS));
  protected readonly text = signal('');
  protected readonly events = signal<readonly ChangeEvent[]>([]);
  protected readonly confirmCapture = signal('');
  protected readonly confirmRemove = signal('');
  protected readonly diff = signal<{ event: ChangeEvent; lines: readonly DiffLine[] | null; note: string } | null>(null);

  protected readonly settings = computed(() => this.watch.state()?.settings ?? null);
  protected readonly folders = computed(() => this.watch.state()?.folders ?? []);
  protected readonly selected = computed(() => this.folders().find((folder) => folder.id === this.selectedId()) ?? null);
  protected readonly grouped = computed(() => groupByDay(this.events()));
  protected readonly rootRemembered = computed(() => {
    const key = this.root().toLowerCase();
    return this.remembered.folders().some((folder) => folder.path.toLowerCase() === key);
  });

  constructor() {
    if (this.platform.isDesktop()) {
      void this.watch.load().then(() => { if (!this.selectedId() && this.folders().length) this.selectedId.set(this.folders()[0].id); });
      void this.remembered.refresh();
    }
    // Refresh the visible timeline whenever the main process reports new activity.
    effect(() => {
      const folder = this.selected();
      void folder?.events;
      void folder?.lastEventAt;
      if (folder) void this.refreshTimeline();
    });
  }

  protected async refreshTimeline(): Promise<void> {
    const folder = this.selected();
    if (!folder) { this.events.set([]); return; }
    try { this.events.set(await this.watch.timeline({ folderId: folder.id, kinds: [...this.kindFilter()], text: this.text(), limit: 2000 })); }
    catch (caught) { this.watch.error.set(caught instanceof Error ? caught.message : String(caught)); }
  }

  protected async addFolder(): Promise<void> {
    if (!this.root()) return;
    if (!this.rootRemembered() && !(await this.remembered.remember(this.root()))) { this.watch.error.set(this.remembered.error()); return; }
    if (await this.watch.add(this.root())) {
      const added = this.folders().find((folder) => folder.path.toLowerCase() === this.root().toLowerCase());
      if (added) this.selectedId.set(added.id);
      this.root.set('');
    }
  }

  protected toggle(folder: WatchedFolderStatus, key: 'enabled' | 'notify', event: Event): void {
    void this.watch.update(folder.id, { [key]: (event.target as HTMLInputElement).checked });
  }

  protected setCapture(folder: WatchedFolderStatus, on: boolean): void {
    this.confirmCapture.set('');
    void this.watch.update(folder.id, { captureContent: on });
  }

  protected setExclude(folder: WatchedFolderStatus, event: Event): void {
    const exclude = (event.target as HTMLInputElement).value.split(',').map((item) => item.trim()).filter(Boolean);
    void this.watch.update(folder.id, { exclude });
  }

  protected async remove(folder: WatchedFolderStatus): Promise<void> {
    this.confirmRemove.set('');
    await this.watch.remove(folder.id);
    if (this.selectedId() === folder.id) this.selectedId.set(this.folders()[0]?.id ?? '');
  }

  protected toggleKind(kind: ChangeKind): void {
    this.kindFilter.update((current) => { const next = new Set(current); if (next.has(kind)) next.delete(kind); else next.add(kind); return next; });
    void this.refreshTimeline();
  }

  protected async showDiff(event: ChangeEvent): Promise<void> {
    const folder = this.selected();
    if (!folder || !event.after) return;
    try {
      const after = await this.watch.content(folder.id, event.after);
      const before = event.before ? await this.watch.content(folder.id, event.before) : null;
      if (after.text === null || (before && before.text === null)) { this.diff.set({ event, lines: null, note: after.binary ? 'Binary content — not shown.' : 'Too large to show (over 5 MiB).' }); return; }
      this.diff.set({ event, lines: computeLineDiff(before?.text ?? '', after.text).lines, note: before ? '' : 'First captured version — no earlier copy to compare against.' });
    } catch (caught) { this.diff.set({ event, lines: null, note: caught instanceof Error ? caught.message : String(caught) }); }
  }

  protected exportTimeline(format: 'csv' | 'json'): void {
    const events = this.events();
    const name = `${(this.selected()?.label || 'folder').replace(/[^\w.-]+/g, '_')}-timeline`;
    if (format === 'csv') downloadFile(new Blob([timelineToCsv(events)], { type: 'text/csv' }), `${name}.csv`);
    else downloadFile(new Blob([JSON.stringify(events, null, 2)], { type: 'application/json' }), `${name}.json`);
  }
  protected delta = WatchedFoldersTool_delta;

  protected time = WatchedFoldersTool_time;

  protected checked(event: Event): boolean { return (event.target as HTMLInputElement).checked; }
  protected kindClass = WatchedFoldersTool_kindClass;

}
