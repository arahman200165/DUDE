import { Component, computed, inject, signal } from '@angular/core';
import type { InstalledSoftware } from "@dude/contracts/system/software-types";
import type { SysApplyResult, SysPlanPreview } from "@dude/contracts/system/sys-mutation-types";
import { PlatformService } from '../../core/platform/platform.service';
import { SystemInfoService } from '../../core/platform/system-info.service';
import { SystemMutationService } from '../../core/platform/system-mutation.service';
import { DesktopOnlyControl } from '../../shared/components/desktop-only-control/desktop-only-control';
import { StatusGlyph } from '../../shared/components/status-glyph/status-glyph';
import { SystemChangePreview } from '../../shared/components/system-change-preview/system-change-preview';
import { ToolShell } from '../../shared/components/tool-shell/tool-shell';
import { appxRemovalCommand, filterSoftware, formatBytes, softwareCsv, sortSoftware, uninstallRequest, type SoftwareSort } from "@dude/tool-engine/tools/installed-software/installed-software-logic";

@Component({
  selector: 'app-installed-software',
  imports: [ToolShell, DesktopOnlyControl, StatusGlyph, SystemChangePreview],
  templateUrl: './installed-software.html',
})
export class InstalledSoftwareTool {
  protected readonly platform = inject(PlatformService);
  private readonly mutations = inject(SystemMutationService);
  private readonly systemInfo = inject(SystemInfoService);
  protected readonly rows = signal<readonly InstalledSoftware[]>([]);
  protected readonly query = signal('');
  protected readonly sort = signal<SoftwareSort>('name');
  protected readonly descending = signal(false);
  protected readonly selectedId = signal<string | null>(null);
  protected readonly preview = signal<SysPlanPreview | null>(null);
  protected readonly loading = signal(false);
  protected readonly error = signal('');
  protected readonly message = signal('');
  protected readonly filtered = computed(() => sortSoftware(filterSoftware(this.rows(), this.query()), this.sort(), this.descending()));
  protected readonly selected = computed(() => this.rows().find((row) => row.id === this.selectedId()) ?? null);
  protected readonly formatBytes = formatBytes;

  constructor() { if (this.platform.isDesktop()) void this.reload(); }

  protected async reload(): Promise<void> {
    this.loading.set(true); this.error.set(''); this.message.set('');
    try {
      this.rows.set(await this.systemInfo.listInstalledSoftware());
    } catch (error) { this.error.set(error instanceof Error ? error.message : String(error)); }
    finally { this.loading.set(false); }
  }

  protected changeSort(value: string): void {
    const next = value as SoftwareSort;
    if (next === this.sort()) this.descending.update((v) => !v);
    else { this.sort.set(next); this.descending.set(false); }
  }

  protected toggleDirection(): void { this.descending.update((value) => !value); }

  protected select(row: InstalledSoftware): void { this.selectedId.set(row.id); this.message.set(''); }

  protected async previewUninstall(): Promise<void> {
    const row = this.selected();
    if (!row || row.source === 'appx') return;
    this.error.set(''); this.message.set('');
    try {
      this.preview.set(await this.mutations.plan({ tool: 'installed-software', title: `Uninstall ${row.name}`, ops: [uninstallRequest(row)] }));
    } catch (error) { this.preview.set(null); this.error.set(error instanceof Error ? error.message : String(error)); }
  }

  protected exportJson(): void { this.download('installed-software.json', JSON.stringify(this.filtered(), null, 2), 'application/json'); }
  protected exportCsv(): void { this.download('installed-software.csv', softwareCsv(this.filtered()), 'text/csv'); }
  private download(name: string, body: string, type: string): void {
    const url = URL.createObjectURL(new Blob([body], { type: `${type};charset=utf-8` }));
    const anchor = document.createElement('a'); anchor.href = url; anchor.download = name; anchor.click(); URL.revokeObjectURL(url);
    this.message.set(`Exported ${this.filtered().length} entries as ${name}.`);
  }

  protected async copyAppxCommand(): Promise<void> {
    const row = this.selected();
    if (!row || row.source !== 'appx') return;
    await navigator.clipboard.writeText(appxRemovalCommand(row));
    this.message.set('Appx removal command copied. Review it in PowerShell before running it.');
  }

  protected onApplied(_: SysApplyResult): void { this.message.set('Vendor uninstaller launched. Refresh the list after it finishes.'); }
}
