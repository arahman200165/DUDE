import { WindowsFeaturesTool_stateLabel, WindowsFeaturesTool_featureCanChange, WindowsFeaturesTool_messageFor } from "@dude/tool-engine/tools/windows-features/windows-features.embedded-engine";
import { Component, computed, inject, signal } from '@angular/core';
import type { WindowsCapability, WindowsFeature } from "@dude/contracts/system/feature-types";
import type { SysApplyResult, SysPlanPreview } from "@dude/contracts/system/sys-mutation-types";
import { PlatformService } from '../../core/platform/platform.service';
import { SystemInfoService } from '../../core/platform/system-info.service';
import { PwshStatusService } from '../../core/platform/pwsh-status.service';
import { SystemMutationService } from '../../core/platform/system-mutation.service';
import { DesktopOnlyControl } from '../../shared/components/desktop-only-control/desktop-only-control';
import { ElevationBanner } from '../../shared/components/elevation-banner/elevation-banner';
import { PwshRequired } from '../../shared/components/pwsh-required/pwsh-required';
import { StatusGlyph } from '../../shared/components/status-glyph/status-glyph';
import { SystemChangePreview } from '../../shared/components/system-change-preview/system-change-preview';
import { ToolShell } from '../../shared/components/tool-shell/tool-shell';

type ListMode = 'features' | 'capabilities';

/** Windows optional feature and Features on Demand inspection (M607). */
@Component({
  selector: 'app-windows-features',
  imports: [ToolShell, DesktopOnlyControl, PwshRequired, ElevationBanner, StatusGlyph, SystemChangePreview],
  templateUrl: './windows-features.html',
})
export class WindowsFeaturesTool {
  protected readonly platform = inject(PlatformService);
  private readonly pwsh = inject(PwshStatusService);
  private readonly systemInfo = inject(SystemInfoService);
  private readonly mutations = inject(SystemMutationService);

  protected readonly features = signal<readonly WindowsFeature[]>([]);
  protected readonly capabilities = signal<readonly WindowsCapability[]>([]);
  protected readonly mode = signal<ListMode>('features');
  protected readonly query = signal('');
  protected readonly statusFilter = signal('all');
  protected readonly loading = signal(false);
  protected readonly error = signal('');
  protected readonly message = signal('');
  protected readonly planBusy = signal(false);
  protected readonly planError = signal('');
  protected readonly preview = signal<SysPlanPreview | null>(null);

  protected readonly featureRows = computed(() => {
    const q = this.query().trim().toLocaleLowerCase();
    return this.features().filter((row) => (!q || `${row.name} ${row.displayName} ${row.state}`.toLocaleLowerCase().includes(q))
      && (this.statusFilter() === 'all' || row.state === this.statusFilter()));
  });
  protected readonly capabilityRows = computed(() => {
    const q = this.query().trim().toLocaleLowerCase();
    return this.capabilities().filter((row) => (!q || `${row.name} ${row.displayName} ${row.state}`.toLocaleLowerCase().includes(q))
      && (this.statusFilter() === 'all' || row.state === this.statusFilter()));
  });
  protected readonly restartCount = computed(() => this.features().filter((row) => row.restartNeeded === true).length);

  constructor() {
    if (this.platform.isDesktop()) void this.start();
  }

  private async start(): Promise<void> {
    const status = await this.pwsh.ensureLoaded();
    if (status.available) await this.refresh();
  }

  protected async refresh(): Promise<void> {
    this.loading.set(true);
    this.error.set('');
    this.message.set('');
    this.preview.set(null);
    try {
      const [features, capabilities] = await Promise.allSettled([this.systemInfo.featureList(), this.systemInfo.featureCapabilities()]);
      if (features.status === 'fulfilled') this.features.set(features.value);
      if (capabilities.status === 'fulfilled') this.capabilities.set(capabilities.value);
      const failed = [features, capabilities].filter((result) => result.status === 'rejected');
      if (failed.length) this.error.set(failed.map((result) => this.messageFor((result as PromiseRejectedResult).reason)).join(' '));
    } catch (caught) { this.error.set(this.messageFor(caught)); }
    finally { this.loading.set(false); }
  }

  protected setMode(value: ListMode): void {
    this.mode.set(value);
    this.statusFilter.set('all');
    this.message.set('');
  }

  protected async previewToggle(feature: WindowsFeature): Promise<void> {
    if (feature.state !== 'enabled' && feature.state !== 'disabled') return;
    const enabling = feature.state === 'disabled';
    this.planBusy.set(true);
    this.planError.set('');
    this.message.set('');
    this.preview.set(null);
    try {
      this.preview.set(await this.mutations.plan({
        tool: 'windows-features',
        title: `${enabling ? 'Enable' : 'Disable'} ${feature.displayName || feature.name}`,
        ops: [{ kind: enabling ? 'feature.enable' : 'feature.disable', params: { name: feature.name } }],
      }));
    } catch (caught) { this.planError.set(this.messageFor(caught)); }
    finally { this.planBusy.set(false); }
  }

  protected onApplied(_result: SysApplyResult): void {
    this.preview.set(null);
    this.message.set('Feature change applied. Windows may need a restart before the change takes effect.');
    void this.refresh();
  }
  protected stateLabel = WindowsFeaturesTool_stateLabel;

  protected featureCanChange = WindowsFeaturesTool_featureCanChange;

  private messageFor = WindowsFeaturesTool_messageFor;

}
