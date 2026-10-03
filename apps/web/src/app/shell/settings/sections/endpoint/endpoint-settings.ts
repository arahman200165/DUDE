import { Component, computed, effect, inject, signal, untracked } from '@angular/core';
import { RouterLink } from '@angular/router';
import type { AgentDiagnostics } from '@dude/contracts';
import type { HubDiagnosticsReport } from '@dude/contracts/hub';
import { HUB_ADMIN } from '../../../../core/hub/hub-admin.token';
import { PlatformService } from '../../../../core/platform/platform.service';
import { CopyButton } from '../../../../shared/components/copy-button/copy-button';
import { Disclosure } from '../../../../shared/components/disclosure/disclosure';
import { StatusGlyph } from '../../../../shared/components/status-glyph/status-glyph';
import { groupFingerprint, hubErrorText, relativeTime } from '../hub/hub-format';
import { HubOwnerSession } from '../hub/hub-owner-session.service';
import { OwnerGate } from '../hub/owner-gate';
import { EndpointBrowserPanel } from './endpoint-browser-panel';
import { AGENT_STATE_COPY, BASIS_LABEL, BIND_LABEL, CHECK_TONE, SOURCE_LABEL, buildCopyReport, daysLeftTone, fixCommand, isSkewed } from './endpoint-format';

/**
 * Settings > Endpoint & Exposure (PD-060). View-only by design: it reports what the Hub, this device and this browser
 * see, and shows the elevated `dude-hub` command that fixes each finding. Nothing here changes exposure, names or
 * certificates, so a stolen owner session cannot widen what the Hub exposes.
 */
@Component({
  selector: 'app-endpoint-settings',
  imports: [CopyButton, Disclosure, EndpointBrowserPanel, OwnerGate, RouterLink, StatusGlyph],
  templateUrl: './endpoint-settings.html',
})
export class EndpointSettings {
  private readonly hub = inject(HUB_ADMIN);
  protected readonly session = inject(HubOwnerSession);
  protected readonly isHubWeb = inject(PlatformService).hostKind === 'hub-web';
  protected readonly isDesktop = !this.isHubWeb;

  protected readonly report = signal<HubDiagnosticsReport | null>(null);
  protected readonly reportError = signal<string | null>(null);
  protected readonly loading = signal(false);
  protected readonly agent = signal<AgentDiagnostics | null>(null);
  protected readonly agentError = signal<string | null>(null);
  protected readonly refreshToken = signal(0);

  protected readonly agentCopy = computed(() => {
    const a = this.agent();
    return a === null ? null : AGENT_STATE_COPY[a.state];
  });
  protected readonly copyText = computed(() => buildCopyReport(this.agent(), this.report()));
  protected readonly failing = computed(() => this.report()?.checks.filter((c) => c.status === 'fail').length ?? 0);

  protected readonly tone = CHECK_TONE;
  protected readonly basis = BASIS_LABEL;
  protected readonly source = SOURCE_LABEL;
  protected readonly bind = BIND_LABEL;
  protected readonly group = groupFingerprint;
  protected readonly fix = fixCommand;
  protected readonly daysTone = daysLeftTone;
  protected readonly skewed = isSkewed;

  constructor() {
    if (this.isDesktop) void this.loadAgent();
    effect(() => {
      if (this.session.signedIn()) untracked(() => void this.loadReport());
      else this.report.set(null);
    });
  }

  protected refresh(): void {
    this.refreshToken.update((n) => n + 1);
    if (this.isDesktop) void this.loadAgent();
    if (this.session.signedIn()) void this.loadReport();
  }

  protected when(iso: string | null): string {
    return iso === null ? 'Never' : `${new Date(iso).toLocaleString()} (${relativeTime(iso)})`;
  }

  private async loadReport(): Promise<void> {
    this.loading.set(true);
    try {
      this.report.set(await this.hub.diagnostics());
      this.reportError.set(null);
    } catch (error) {
      if (!this.session.noteError(error, { unauthorizedMeansExpired: true })) this.reportError.set(hubErrorText(error, 'The Hub report could not be loaded.'));
    } finally {
      this.loading.set(false);
    }
  }

  private async loadAgent(): Promise<void> {
    if (this.hub.agentDiagnostics === undefined) return;
    try {
      this.agent.set(await this.hub.agentDiagnostics());
      this.agentError.set(null);
    } catch (error) {
      this.agentError.set(hubErrorText(error, "This device's report could not be loaded."));
    }
  }
}
