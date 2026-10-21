import { Component, computed, inject, signal } from '@angular/core';
import { ToolShell } from '../../shared/components/tool-shell/tool-shell';
import { CopyButton } from '../../shared/components/copy-button/copy-button';
import { PlatformService } from '../../core/platform/platform.service';
import { SystemInfoService } from '../../core/platform/system-info.service';
import {
  buildDeviceReport,
  DEVICE_FACT_GROUPS,
  DEVICE_GROUP_TITLES,
  formatDeviceReportJson,
  formatDeviceReportText,
  type DeviceFact,
  type DeviceReport,
} from '@dude/tool-engine/tools/device-info/device-report';
import { collectBrowserFacts, osFactsToDeviceFacts } from './device-info.collector';

@Component({
  selector: 'app-device-info',
  imports: [ToolShell, CopyButton],
  templateUrl: './device-info.html',
})
export class DeviceInfo {
  private readonly platform = inject(PlatformService);
  private readonly system = inject(SystemInfoService);

  /** The report lives only in memory: nothing here is persisted. */
  protected readonly report = signal<DeviceReport | null>(null);
  protected readonly loading = signal(false);
  protected readonly isDesktop = this.platform.isDesktop;

  protected readonly text = computed(() => {
    const current = this.report();
    return current ? formatDeviceReportText(current) : '';
  });
  protected readonly json = computed(() => {
    const current = this.report();
    return current ? formatDeviceReportJson(current) : '';
  });
  protected readonly groups = computed(() => {
    const facts = this.report()?.facts ?? [];
    return DEVICE_FACT_GROUPS.map((group) => ({
      group,
      title: DEVICE_GROUP_TITLES[group],
      facts: facts.filter((fact) => fact.group === group),
    })).filter((entry) => entry.facts.length > 0);
  });

  constructor() {
    void this.refresh();
  }

  protected async refresh(): Promise<void> {
    this.loading.set(true);
    try {
      // Desktop facts come first so they win when both sides report the same fact.
      const facts: DeviceFact[] = [];
      if (this.isDesktop()) {
        const os = await this.system.osFacts().catch(() => null);
        if (os) facts.push(...osFactsToDeviceFacts(os));
      }
      facts.push(...(await collectBrowserFacts()));
      this.report.set(buildDeviceReport(this.isDesktop() ? 'desktop' : 'web', facts, new Date()));
    } finally {
      this.loading.set(false);
    }
  }
}
