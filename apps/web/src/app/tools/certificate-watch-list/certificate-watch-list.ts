import { CertificateWatchListTool_statusClass, CertificateWatchListTool_days } from "@dude/tool-engine/tools/certificate-watch-list/certificate-watch-list.embedded-engine";
import { Component, computed, inject, signal } from '@angular/core';
import { ToolShell } from '../../shared/components/tool-shell/tool-shell';
import { DesktopOnlyControl } from '../../shared/components/desktop-only-control/desktop-only-control';
import { PlatformService } from '../../core/platform/platform.service';
import { CertificateWatchService } from '../../core/platform/certificate-watch.service';
import { LiveEndpointContextService } from '../../core/platform/live-endpoint-context.service';
import { STARTTLS_PROTOCOLS, type StartTlsProtocol, type WatchEntry } from "@dude/contracts/core/platform/network-types";
import { downloadFile } from '../../shared/utils/download-file';

/** Certificate Watch List & Expiration Monitor (Phase 28 items 17, 24). */
@Component({
  selector: 'app-certificate-watch-list',
  imports: [ToolShell, DesktopOnlyControl],
  templateUrl: './certificate-watch-list.html',
})
export class CertificateWatchListTool {
  protected readonly platform = inject(PlatformService);
  protected readonly watch = inject(CertificateWatchService);
  private readonly context = inject(LiveEndpointContextService);
  protected readonly starttlsProtocols = STARTTLS_PROTOCOLS;

  protected readonly label = signal('');
  protected readonly host = signal('');
  protected readonly port = signal(443);
  protected readonly sni = signal('');
  protected readonly starttls = signal<'' | StartTlsProtocol>('');
  protected readonly clearing = signal(false);

  protected readonly settings = computed(() => this.watch.state()?.settings ?? null);
  protected readonly entries = computed(() => this.watch.state()?.entries ?? []);
  protected readonly nextPass = computed(() => this.watch.state()?.nextPassAt);

  constructor() {
    if (this.platform.isDesktop()) {
      void this.watch.load();
      const pending = this.context.takeWatch();
      if (pending) { this.host.set(pending.host); this.port.set(pending.port); if (pending.sni) this.sni.set(pending.sni); if (pending.starttlsProtocol) this.starttls.set(pending.starttlsProtocol); }
    }
  }

  protected text(field: 'label' | 'host' | 'sni', event: Event): void { this[field].set((event.target as HTMLInputElement).value); }
  protected setPort(event: Event): void { this.port.set(Number((event.target as HTMLInputElement).value)); }
  protected setStarttls(event: Event): void { this.starttls.set((event.target as HTMLSelectElement).value as '' | StartTlsProtocol); }

  protected async add(): Promise<void> {
    if (!this.host().trim()) return;
    const entry: Partial<WatchEntry> = { label: this.label().trim(), host: this.host().trim(), port: this.port(), ...(this.sni().trim() ? { sni: this.sni().trim() } : {}), ...(this.starttls() ? { starttlsProtocol: this.starttls() as StartTlsProtocol } : {}) };
    await this.watch.upsert(entry);
    this.label.set(''); this.host.set(''); this.sni.set(''); this.starttls.set('');
    await this.watch.checkNow((this.entries().at(-1))?.id);
  }
  protected toggleEnabled(event: Event): void { void this.watch.setSettings({ enabled: (event.target as HTMLInputElement).checked }); }
  protected setInterval(event: Event): void { void this.watch.setSettings({ intervalHours: Number((event.target as HTMLSelectElement).value) as 6 | 12 | 24 }); }
  protected setThresholds(event: Event): void {
    const thresholds = (event.target as HTMLInputElement).value.split(/[\s,]+/).map(Number).filter((value) => Number.isInteger(value) && value > 0);
    if (thresholds.length) void this.watch.setSettings({ thresholds });
  }
  protected toggleNotifications(event: Event): void { void this.watch.setSettings({ notifications: (event.target as HTMLInputElement).checked }); }
  protected async clearAll(): Promise<void> { await this.watch.clearAll(); this.clearing.set(false); }
  protected async exportList(): Promise<void> {
    const json = await this.watch.exportJson();
    if (json) downloadFile(new Blob([json], { type: 'application/json' }), 'certificate-watch-list.json');
  }
  protected async importList(event: Event): Promise<void> {
    const file = (event.target as HTMLInputElement).files?.[0];
    if (file) await this.watch.importJson(await file.text());
  }
  protected statusClass = CertificateWatchListTool_statusClass;

  protected days = CertificateWatchListTool_days;

}
