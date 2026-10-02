import { Component, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import type { SysApplyResult, SysPlanPreview, SysPlanRequest } from "@dude/contracts/system/sys-mutation-types";
import type { FileLockHandleScanResult, FileLockListResult } from "@dude/contracts/system/system-types";
import { ElevationService } from '../../core/platform/elevation.service';
import { NativeFsService } from '../../core/platform/native-fs.service';
import { PlatformService } from '../../core/platform/platform.service';
import { SystemInfoService } from '../../core/platform/system-info.service';
import { SystemMutationService } from '../../core/platform/system-mutation.service';
import { DesktopOnlyControl } from '../../shared/components/desktop-only-control/desktop-only-control';
import { ElevationBanner } from '../../shared/components/elevation-banner/elevation-banner';
import { StatusGlyph } from '../../shared/components/status-glyph/status-glyph';
import { SystemChangePreview } from '../../shared/components/system-change-preview/system-change-preview';
import { ToolShell } from '../../shared/components/tool-shell/tool-shell';
import {
  appStatusLabel, appTypeLabel, canRelease, endOwnerRequest, ownerKey, rebootNeeded, releaseRequest, type LockOwner,
} from "@dude/tool-engine/tools/file-lock-inspector/file-lock-inspector-logic";

/**
 * File Lock Inspector (DUDE_PRD.md §21 Phase 31, Milestone 611). Restart Manager lists the applications and
 * services holding a picked file or folder (no elevation needed); an elevated session can also scan handles
 * for exact handle values and paths. Releasing a lock always goes preview, then a separate confirm, through
 * the system mutation engine: graceful Restart Manager shutdown is the preferred path, ending the owner
 * process is the fallback. A handle is never force-closed.
 */
@Component({
  selector: 'app-file-lock-inspector',
  imports: [RouterLink, ToolShell, DesktopOnlyControl, ElevationBanner, StatusGlyph, SystemChangePreview],
  templateUrl: './file-lock-inspector.html',
})
export class FileLockInspectorTool {
  protected readonly platform = inject(PlatformService);
  protected readonly elevation = inject(ElevationService);
  private readonly system = inject(SystemInfoService);
  private readonly nativeFs = inject(NativeFsService);
  private readonly mutations = inject(SystemMutationService);

  protected readonly target = signal<{ path: string; folder: boolean } | null>(null);
  protected readonly listing = signal<FileLockListResult | null>(null);
  protected readonly handles = signal<FileLockHandleScanResult | null>(null);
  protected readonly error = signal('');
  protected readonly actionError = signal('');
  protected readonly busy = signal(false);
  protected readonly preview = signal<SysPlanPreview | null>(null);

  protected readonly owners = computed<readonly LockOwner[]>(() => this.listing()?.owners ?? []);
  protected readonly releasable = computed(() => canRelease(this.owners()));
  protected readonly reboot = computed(() => rebootNeeded(this.listing()?.rebootReasons ?? 0));
  protected readonly canScanHandles = computed(() => this.elevation.elevated() === true);

  protected readonly appType = appTypeLabel;
  protected readonly appStatus = appStatusLabel;
  protected readonly trackOwner = (_: number, o: LockOwner): string => ownerKey(o);

  protected async pickFile(): Promise<void> {
    await this.pick(async () => {
      const picked = await this.nativeFs.pickFile();
      return picked.canceled ? null : { path: picked.path, folder: false };
    });
  }

  protected async pickFolder(): Promise<void> {
    await this.pick(async () => {
      const picked = await this.nativeFs.pickDirectory();
      return picked.canceled ? null : { path: picked.rootPath, folder: true };
    });
  }

  private async pick(choose: () => Promise<{ path: string; folder: boolean } | null>): Promise<void> {
    this.error.set('');
    try {
      const chosen = await choose();
      if (!chosen) return;
      this.target.set(chosen);
      this.preview.set(null);
      await this.find();
    } catch (caught) { this.error.set(message(caught)); }
  }

  /** Read-only: Restart Manager lookup. Never plans or applies anything. */
  protected async find(): Promise<void> {
    const target = this.target();
    if (!target) return;
    this.busy.set(true);
    this.error.set('');
    this.handles.set(null);
    try { this.listing.set(await this.system.lockOwners(target.path)); }
    catch (caught) { this.listing.set(null); this.error.set(message(caught)); }
    finally { this.busy.set(false); }
  }

  /** Read-only, elevated only: exact handle values and paths. */
  protected async scanHandles(): Promise<void> {
    const target = this.target();
    if (!target || !this.canScanHandles()) return;
    this.busy.set(true);
    this.error.set('');
    try { this.handles.set(await this.system.lockHandles(target.path)); }
    catch (caught) { this.handles.set(null); this.error.set(message(caught)); }
    finally { this.busy.set(false); }
  }

  protected release(restartAfter: boolean): Promise<void> {
    const target = this.target();
    return target ? this.plan(releaseRequest(target.path, restartAfter)) : Promise.resolve();
  }

  protected endOwner(owner: { pid: number; startKey: string; name: string }): Promise<void> {
    const target = this.target();
    return target ? this.plan(endOwnerRequest(target.path, owner)) : Promise.resolve();
  }

  /** Only asks the main process to build a plan; nothing is issued or applied here. */
  private async plan(request: SysPlanRequest): Promise<void> {
    this.actionError.set('');
    this.busy.set(true);
    try { this.preview.set(await this.mutations.plan(request)); }
    catch (caught) { this.preview.set(null); this.actionError.set(message(caught)); }
    finally { this.busy.set(false); }
  }

  protected onApplied(_result: SysApplyResult): void { void this.find(); }
}

const message = (caught: unknown): string => (caught instanceof Error ? caught.message : String(caught));
