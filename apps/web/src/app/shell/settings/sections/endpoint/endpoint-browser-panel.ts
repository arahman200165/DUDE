import { Component, effect, inject, input, signal, untracked } from '@angular/core';
import type { HubDiagnosticsReport } from '@dude/contracts/hub';
import { StatusGlyph, type StatusGlyphKind } from '../../../../shared/components/status-glyph/status-glyph';
import { ORIGIN_COPY, pemToDer, serviceWorkerLabel } from './browser-checks';
import { BrowserChecks, type BrowserCheckResults } from './browser-checks.service';

/** "This browser" (Hub-served web build only): checks only this tab can make. Computed client-side, nothing is uploaded. */
@Component({
  selector: 'app-endpoint-browser-panel',
  imports: [StatusGlyph],
  template: `
    <div data-setting class="flex flex-col gap-2" data-testid="browser-checks">
      <h3 class="text-ui-sm font-semibold text-text">This browser</h3>
      @if (results(); as r) {
        <ul class="flex flex-col gap-1.5 text-ui">
          <li class="flex flex-col" data-testid="check-secure-context">
            <span class="inline-flex items-center gap-1 font-semibold" [class]="tone(r.secureContext ? 'success' : 'error')"><app-status-glyph [kind]="r.secureContext ? 'success' : 'error'" />Secure context: {{ r.secureContext ? 'yes' : 'no' }}</span>
          </li>
          <li class="flex flex-col" data-testid="check-trust">
            <span class="inline-flex items-center gap-1 font-semibold" [class]="tone(trustGlyph(r))"><app-status-glyph [kind]="trustGlyph(r)" />{{ r.trust.summary }}</span>
            <span class="text-text-muted">{{ r.trust.detail }}</span>
            @if (r.rootPem && r.trust.verdict !== 'trusted') {
              <span class="mt-1 flex flex-wrap items-center gap-2" data-testid="root-download">
                <button type="button" class="rounded-sm border border-border px-2 py-0.5 text-ui text-text hover:bg-panel-elevated" (click)="download(r.rootPem, 'cer')">Download root (.cer)</button>
                <button type="button" class="rounded-sm border border-border px-2 py-0.5 text-ui text-text hover:bg-panel-elevated" (click)="download(r.rootPem, 'pem')">Download root (.pem)</button>
              </span>
            }
          </li>
          <li class="flex flex-col" data-testid="check-realtime">
            <span class="inline-flex items-center gap-1 font-semibold" [class]="tone(r.realtime.ok ? 'success' : 'error')"><app-status-glyph [kind]="r.realtime.ok ? 'success' : 'error'" />Realtime connection: {{ r.realtime.ok ? 'reachable' + (r.realtime.ms === null ? '' : ' (' + r.realtime.ms + ' ms)') : 'failed' }}</span>
            <span class="text-text-muted">{{ r.realtime.detail }}</span>
          </li>
          <li class="flex flex-col" data-testid="check-skew">
            @if (r.skew.seconds === null) {
              <span class="inline-flex items-center gap-1 font-semibold text-text-muted"><app-status-glyph kind="neutral" />Clock skew: unknown</span>
            } @else {
              <span class="inline-flex items-center gap-1 font-semibold" [class]="tone(r.skew.warn ? 'warning' : 'success')"><app-status-glyph [kind]="r.skew.warn ? 'warning' : 'success'" />Clock skew: {{ r.skew.seconds }} s</span>
              @if (r.skew.warn) { <span class="text-text-muted">This browser's clock differs from the Hub's by more than a minute. Certificates and sessions can look expired.</span> }
            }
          </li>
          <li class="flex flex-col" data-testid="check-origin">
            <span class="text-text-muted">Origin <code class="font-mono text-text" data-testid="origin">{{ r.origin }}</code></span>
            <span [class]="r.originMatch === 'unknown' ? 'text-warning' : 'text-text-muted'" data-testid="origin-match">{{ originCopy(r) }}</span>
          </li>
          <li class="flex flex-col" data-testid="check-service-worker">
            <span class="text-text-muted">Service worker <span class="text-text" data-testid="sw-state">{{ swLabel(r) }}</span></span>
          </li>
        </ul>
      } @else if (running()) {
        <p class="text-ui text-text-muted" role="status">Checking this browser…</p>
      }
    </div>
  `,
})
export class EndpointBrowserPanel {
  private readonly checks = inject(BrowserChecks);
  /** The owner's Hub report, when there is one (null until sign-in); only used to compare names and decide whether to offer the root. */
  readonly report = input<HubDiagnosticsReport | null>(null);
  /** Bumped by the parent's Refresh button. */
  readonly refreshToken = input(0);

  protected readonly results = signal<BrowserCheckResults | null>(null);
  protected readonly running = signal(false);

  constructor() {
    effect(() => {
      const report = this.report();
      this.refreshToken();
      untracked(() => void this.run(report));
    });
  }

  private async run(report: HubDiagnosticsReport | null): Promise<void> {
    this.running.set(true);
    try {
      this.results.set(await this.checks.run(report));
    } finally {
      this.running.set(false);
    }
  }

  protected tone(kind: StatusGlyphKind): string {
    return kind === 'success' ? 'text-success' : kind === 'warning' ? 'text-warning' : kind === 'error' ? 'text-error' : 'text-text-muted';
  }
  protected trustGlyph(r: BrowserCheckResults): StatusGlyphKind {
    return r.trust.verdict === 'trusted' ? 'success' : r.trust.verdict === 'unknown' ? 'warning' : 'error';
  }
  protected originCopy(r: BrowserCheckResults): string {
    return ORIGIN_COPY[r.originMatch];
  }
  protected swLabel(r: BrowserCheckResults): string {
    return serviceWorkerLabel(r.serviceWorker);
  }

  protected download(pem: string, kind: 'cer' | 'pem'): void {
    const der = kind === 'cer' ? pemToDer(pem) : null;
    if (kind === 'cer' && der === null) return;
    const blob = new Blob([kind === 'cer' ? der! : pem], { type: kind === 'cer' ? 'application/pkix-cert' : 'application/x-pem-file' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `dude-hub-root.${kind}`;
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
}
