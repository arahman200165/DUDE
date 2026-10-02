import { Component, DestroyRef, computed, effect, inject, input, output, signal } from '@angular/core';
import type { PairingCodeResponse } from '@dude/contracts/hub';
import { toDataURL } from 'qrcode';
import { CopyButton } from '../../../../shared/components/copy-button/copy-button';
import { PreviewBackgroundTarget } from '../../../../shared/components/preview-background/preview-background';

/**
 * A freshly created pairing code: the pairing string, the 8-character code on its own, a QR code of the string and
 * a live expiry countdown. Once expired the secrets are hidden and only "Create a new code" is offered.
 */
@Component({
  selector: 'app-pairing-code-panel',
  imports: [CopyButton, PreviewBackgroundTarget],
  template: `
    <section class="flex flex-col gap-2 rounded-sm border border-border p-3" aria-label="Pairing code" data-testid="pairing-panel">
      <p class="text-ui text-text">Paste this into DUDE on the new device: Settings › Environment &amp; Hub › Connect to a Hub.</p>
      @if (expired()) {
        <p class="text-ui text-warning" role="status" data-testid="pairing-expired">This code has expired.</p>
        <div class="flex gap-2">
          <button type="button" class="rounded-sm border border-accent px-2 py-0.5 text-ui text-accent hover:bg-accent/10" (click)="renew.emit()">Create a new code</button>
          <button type="button" class="rounded-sm border border-border px-2 py-0.5 text-ui text-text-muted hover:bg-panel-elevated" (click)="dismiss.emit()">Close</button>
        </div>
      } @else {
        <div class="flex flex-wrap items-start gap-4">
          <div class="flex min-w-0 flex-1 flex-col gap-2">
            <div class="flex flex-col gap-1">
              <span class="text-ui text-text-muted" id="pairing-string-label">Pairing string</span>
              <code class="break-all rounded-sm border border-border bg-panel px-2 py-1 font-mono text-ui text-text" aria-labelledby="pairing-string-label" data-testid="pairing-string">{{ code().pairingString }}</code>
              <div><app-copy-button [text]="code().pairingString" label="Copy pairing string" /></div>
            </div>
            <div class="flex items-center gap-2">
              <span class="text-ui text-text-muted">Code</span>
              <code class="font-mono text-ui-sm font-semibold text-text" data-testid="pairing-code">{{ code().pairingCode }}</code>
              <app-copy-button [text]="code().pairingCode" label="Copy code" />
            </div>
            <p class="text-ui text-text-muted" role="timer" data-testid="pairing-countdown">Expires in {{ countdown() }}. The code works once.</p>
            <div class="flex gap-2">
              <button type="button" class="rounded-sm border border-border px-2 py-0.5 text-ui text-text-muted hover:bg-panel-elevated" (click)="renew.emit()">Create a new code</button>
              <button type="button" class="rounded-sm border border-border px-2 py-0.5 text-ui text-text-muted hover:bg-panel-elevated" (click)="dismiss.emit()">Close</button>
            </div>
          </div>
          @if (qr(); as src) {
            <div class="shrink-0 rounded-sm border border-border p-2" appPreviewBackground="white" data-testid="pairing-qr">
              <img [src]="src" width="160" height="160" alt="QR code of the pairing string" />
            </div>
          }
        </div>
      }
    </section>
  `,
})
export class PairingCodePanel {
  readonly code = input.required<PairingCodeResponse>();
  readonly renew = output<void>();
  readonly dismiss = output<void>();

  private readonly now = signal(Date.now());
  protected readonly qr = signal<string | null>(null);
  protected readonly remainingMs = computed(() => Math.max(0, Date.parse(this.code().expiresAt) - this.now()));
  protected readonly expired = computed(() => this.remainingMs() <= 0);
  protected readonly countdown = computed(() => {
    const seconds = Math.ceil(this.remainingMs() / 1000);
    return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
  });

  constructor() {
    const timer = setInterval(() => this.now.set(Date.now()), 1000);
    inject(DestroyRef).onDestroy(() => clearInterval(timer));
    effect(() => {
      const text = this.code().pairingString;
      this.now.set(Date.now());
      // The default QR colors are black on white, drawn on a white frame: scanners need that contrast in every theme.
      toDataURL(text, { errorCorrectionLevel: 'M', margin: 1, width: 320 }).then(
        (url) => this.qr.set(url),
        () => this.qr.set(null),
      );
    });
  }
}
